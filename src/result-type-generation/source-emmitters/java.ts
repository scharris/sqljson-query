import { upperCamelCase, indentLines, Nullable } from '../../util/mod';
import { QueryTypesFileHeader, ResultRepr } from '../../query-specs';
import {
  ChildCollectionResultTypeProperty, TableFieldResultTypeProperty, TableExpressionResultTypeProperty,
  ParentReferenceResultTypeProperty, NamedResultTypeSpec, requireNamedResultType,
} from '../result-type-specs';
import { SourceGenerationOptions } from '../../source-generation-options';
import { ResultTypesSource } from "../result-types-source";

export default function makeSource
  (
    resultTypeSpecs: NamedResultTypeSpec[],
    queryName: string,
    queryTypesFileHeader: Nullable<QueryTypesFileHeader>,
    sqlResources: Map<ResultRepr, string>,
    queryParamNames: string[],
    opts: SourceGenerationOptions
  )
  : ResultTypesSource
{
  const sqlPathMembers = sqlResources.size == 0 ? '' :
    '  // The types defined in this file correspond to results of the following generated SQL queries.\n' +
    indentLines(sqlFileReferences(sqlResources), 2) + '\n\n';
  const sqlParamMembers = queryParamNames.length == 0 ? '' :
    "  // query parameters\n" +
    indentLines(queryParamDefinitions(queryParamNames), 2) + '\n\n';

  const compilationUnitNameNoExt = makeCompilationUnitNameNoExt(queryName);

  return {
    compilationUnitName: compilationUnitNameNoExt + '.java',
    sourceCode:
      (opts?.javaPackage ? `package ${opts.javaPackage};\n\n` : '') +
      typesFileHeaders(opts, queryTypesFileHeader) +
      standardImports + '\n\n' +
      `public class ${compilationUnitNameNoExt}\n` +
      '{\n' +
        sqlPathMembers +
        sqlParamMembers +
        "  // Below are types representing the result data for the generated query, with top-level result type first.\n\n" +
        indentLines(resultTypeDeclarations(resultTypeSpecs, opts), 2) + '\n' +
      '}\n'
  };
}

function typesFileHeaders
  (
    opts: SourceGenerationOptions,
    queryTypesFileHeader: Nullable<QueryTypesFileHeader>
  )
  : string
{
  const generalHeaders = opts?.typesHeaders?.get('Java');
  return (generalHeaders ? generalHeaders + '\n' : '') +
    queryTypesFileHeader == null ? '' :
      (typeof queryTypesFileHeader === 'string'
        ? queryTypesFileHeader
        : queryTypesFileHeader?.Java ?? '');

}

function sqlFileReferences
  (
    sqlResources: Map<ResultRepr, string>
  )
  : string
{
  const lines = [];

  for (const repr of Array.from(sqlResources.keys()).sort())
  {
    const memberName = 'sqlResource' + (sqlResources.size == 1 ? '' : upperCamelCase(repr));
    const resourceName = sqlResources.get(repr);
    lines.push(`public static final String ${memberName} = "${resourceName}";`);
  }

  return lines.join('\n') + '\n';
}

function queryParamDefinitions(paramNames: string[]): string
{
  const makeParamDecl = (paramName: string) =>
    `public static final String ${paramName}Param = \"${paramName}\";`;
  return paramNames.map(makeParamDecl).join('\n\n');
}

function resultTypeDeclarations
  (
    resultTypes: NamedResultTypeSpec[],
    opts: SourceGenerationOptions
  )
  : string
{
  return resultTypes.flatMap(resType =>
    resType.unwrapped ? [] : [ makeResultTypeDeclaration(resType, opts) + '\n' ]
  ).join('\n');
}

function makeResultTypeDeclaration
  (
    resType: NamedResultTypeSpec,
    opts: SourceGenerationOptions
  )
  : string
{
  const emitRecords: boolean = opts?.javaEmitRecords ?? true;
  const vis = emitRecords ? '' : 'public ';

  const decls = resType.properties.map(prop => {
    switch(prop.type)
    {
      case 'rtp-field':
        return `${vis}${tableFieldType(prop, resType, opts)} ${prop.propertyName}`;
      case 'rtp-expr':
        return `${vis}${tableExprType(prop, opts)} ${prop.propertyName}`;
      case 'rtp-parent-ref':
        return `${vis}${parentRefType(prop)} ${prop.propertyName}`;
      case 'rtp-child-coll':
        return `${vis}${childCollType(prop, opts)} ${prop.propertyName}`;
    }
  });

  if (emitRecords) return (
    `public record ${resType.resultTypeName}(\n` +
      indentLines(decls.join(',\n'), 2) + '\n' +
    '){}'
  );
  else return (
    '@SuppressWarnings("nullness") // because fields will be set directly by the deserializer not by constructor\n' +
    `public static class ${resType.resultTypeName}\n` +
    '{\n' +
      indentLines(decls.join(';\n'), 2) + ';\n' +
    '}'
  );
}

function tableFieldType
  (
    tfp: TableFieldResultTypeProperty,
    inResType: NamedResultTypeSpec,
    opts: SourceGenerationOptions
  )
  : string
{
  if (tfp.specifiedSourceCodeFieldType != null)
    return specifiedSourceCodeFieldType(tfp.specifiedSourceCodeFieldType);

  const customizedType = opts.customPropertyTypeFn && opts.customPropertyTypeFn(tfp, inResType, 'Java');
  if (customizedType)
    return customizedType;

  const lcDbFieldType = tfp.databaseType.toLowerCase();

  switch (lcDbFieldType)
  {
    case 'number':
    case 'numeric':
    case 'decimal':
    case 'bigint':
    case 'int':
    case 'integer':
    case 'int4':
    case 'smallint':
    case 'int8':
      return generalNumericTableFieldPropertyType(tfp);
    case 'float':
    case 'real':
    case 'double':
      return floatingNumericTableFieldPropertyType(tfp);
    case 'varchar':
    case 'varchar2':
    case 'text':
    case 'longvarchar':
    case 'char':
    case 'clob':
    case 'date':
    case 'time':
    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamptz':
    case 'uuid':
      return textTableFieldPropertyType(tfp);
    case 'bit':
    case 'boolean':
    case 'bool':
      return booleanTableFieldPropertyType(tfp);
    case 'json':
    case 'jsonb':
      return jsonTableFieldPropertyType(tfp);
    default:
      if ( lcDbFieldType.startsWith('timestamp') )
        return textTableFieldPropertyType(tfp);
      else throw new Error(`unsupported type for field '${tfp.databaseFieldName}' of type '${tfp.databaseType}'`);
  }
}

function tableExprType
  (
    tep: TableExpressionResultTypeProperty,
    opts: SourceGenerationOptions
  )
  : string
{
  if (!tep.specifiedSourceCodeFieldType) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${tep.propertyName}.`);

  return specifiedSourceCodeFieldType(tep.specifiedSourceCodeFieldType);
}

function parentRefType
  (
    prop: ParentReferenceResultTypeProperty,
  )
  : string
{
  return withNullability(prop.nullable, requireNamedResultType(prop.refResultType).resultTypeName);
}

function childCollType
  (
    prop: ChildCollectionResultTypeProperty,
    opts: SourceGenerationOptions
  )
  : string
{
  const collElType = prop.elResultType.unwrapped ?
    getSolePropertyType(requireNamedResultType(prop.elResultType), opts)
    : requireNamedResultType(prop.elResultType).resultTypeName;

  return withNullability(prop.nullable, `List<${toReferenceType(collElType)}>`);
}

function specifiedSourceCodeFieldType
  (
    specSourceCodeFieldType: string | {[srcLang: string]: string}
  )
  : string
{
  switch (typeof specSourceCodeFieldType)
  {
    case 'string':
      return specSourceCodeFieldType;
    default:
      if ( !('Java' in specSourceCodeFieldType) )
        throw new Error(
          `Expression type for language 'Java' not specified for table expression ` +
          `property ${specSourceCodeFieldType}.`
        );
      return specSourceCodeFieldType['Java'];
  }
}

function getSolePropertyType
  (
    resType: NamedResultTypeSpec,
    opts: SourceGenerationOptions
  )
  : string
{
  if (resType.properties.length !== 1)
    throw new Error(`Expected single field when unwrapping result type ${JSON.stringify(resType)}.`);

  const prop = resType.properties[0];

  switch(prop.type)
  {
    case 'rtp-field':
      return tableFieldType(prop, resType, opts);
    case 'rtp-expr':
      return tableExprType(prop, opts);
    case 'rtp-child-coll':
      return childCollType(prop, opts);
    case 'rtp-parent-ref':
      return parentRefType(prop);
    default:
      throw new Error(`Unhandled field category when unwrapping ${JSON.stringify(resType)}.`);
  }
}

function generalNumericTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  if (fp.fractionalDigits == null || fp.fractionalDigits > 0)
    return withNullability(fp.nullable, 'BigDecimal');
  else // no fractional part
  {
    const primTypeName = fp.precision == null || fp.precision > 9 ? "long" : "int";
    return withNullability(fp.nullable, primTypeName);
  }
}

function floatingNumericTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, "double");
}

function textTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, "String");
}

function booleanTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, "boolean");
}

function jsonTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, 'JsonNode');
}

function withNullability
  (
    maybeNullable: Nullable<boolean>,
    typeName: string,
  )
  : string
{
  const nullable = maybeNullable == null ? true : maybeNullable;
  if (nullable) return '@Nullable ' + toReferenceType(typeName);
  else return typeName;
}

function toReferenceType(typeName: string): string
{
  switch (typeName)
  {
    case 'int': return 'Integer';
    case 'long': return 'Long';
    case 'double': return 'Double';
    case 'float': return 'Float';
    case 'boolean': return 'Boolean';
    case 'char': return 'Character';
    case 'short': return 'Short';
    case 'byte': return 'Byte';
    default: return typeName;
  }
}

const standardImports: string =
  'import java.util.*;\n' +
  'import java.math.*;\n' +
  'import java.time.*;\n' +
  'import org.checkerframework.checker.nullness.qual.Nullable;\n' +
  'import org.checkerframework.checker.nullness.qual.NonNull;\n' +
  'import org.checkerframework.framework.qual.DefaultQualifier;\n' +
  'import org.checkerframework.framework.qual.TypeUseLocation;\n' +
  'import com.fasterxml.jackson.databind.JsonNode;\n' +
  'import com.fasterxml.jackson.databind.node.*;\n';

function makeCompilationUnitNameNoExt(queryName: string): string
{
  return upperCamelCase(queryName);
}