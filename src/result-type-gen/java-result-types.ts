import * as path from 'path';
import {
  hashString,
  upperCamelCase,
  partitionByEquality,
  makeNameNotInSet,
  indentLines,
  readTextFileSync
} from '../util/mod';
import { ResultRepr } from '../query-specs';
import {
  ResultTypeDescriptor, ChildCollectionProperty, TableFieldProperty, TableExpressionProperty,
  ParentReferenceProperty, propertiesCount, resultTypeDecriptorsEqual,
} from './result-type-descriptors';
import {
  JavaSourceGenerationOptions,
  ResultTypesSourceGenerationOptions
} from '../source-gen-options';
import { QueryReprSqlPath, ResultTypesSource } from './common-types';

export function makeJavaSource
  (
    queryName: string,
    resultTypes: ResultTypeDescriptor[],
    queryTypesFileHeader: string | undefined,
    queryParamNames: string[],
    sqlPaths: QueryReprSqlPath[],
    opts: JavaResultTypesSourceGenerationOptions
  )
  : ResultTypesSource
{
  const sqlPathMembers = sqlPaths.length == 0 ? '' :
    '  // The types defined in this file correspond to results of the following generated SQL queries.\n' +
    indentLines(sqlFileReferences(queryName, sqlPaths, opts.sqlResourcePathPrefix), 2) + '\n\n';
  const sqlParamMembers = queryParamNames.length == 0 ? '' :
    "  // query parameters\n" +
    indentLines(queryParamDefinitions(queryParamNames), 2) + '\n\n';

  const compilationUnitName = makeCompilationUnitName(queryName);

  return {
    compilationUnitName,
    sourceCode:
      (opts?.javaOptions?.javaPackage ? `package ${opts.javaOptions.javaPackage};\n\n` : '') +
      generalTypesFileHeader(opts.typesHeaderFile) +
      (queryTypesFileHeader || '') + '\n' +
      standardImports + '\n\n' +
      `public class ${compilationUnitName}\n` +
      '{\n' +
        sqlPathMembers +
        sqlParamMembers +
        "  // Below are types representing the result data for the generated query, with top-level result type first.\n\n" +
        indentLines(resultTypeDeclarations(resultTypes, opts), 2) + '\n' +
      '}\n'
  };
}

function generalTypesFileHeader(typesHeaderFile: string | undefined): string
{
  if (typesHeaderFile != null) return readTextFileSync(typesHeaderFile) + "\n";
  else return '';
}

function sqlFileReferences
  (
    queryName: string,
    queryReprSqlPaths: QueryReprSqlPath[],
    sqlResourcePathPrefix: string | undefined,
  )
  : string
{
  const lines = [];
  const sqlPathsByRepr = makeQueryResultReprToSqlPathMap(queryName, queryReprSqlPaths);

  for ( const repr of Array.from(sqlPathsByRepr.keys()).sort() )
  {
    const memberName = 'sqlResource' + (sqlPathsByRepr.size == 1 ? '' : upperCamelCase(repr));
    const resourceName = (sqlResourcePathPrefix || '') + path.basename(sqlPathsByRepr.get(repr) || '');
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
    resultTypes: ResultTypeDescriptor[],
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  if (resultTypes.length === 0) return '';

  const typeDecls: string[] = [];
  const writtenTypeNames = new Set();

  const resultTypeNameAssignments: Map<ResultTypeDescriptor,string> = assignResultTypeNames(resultTypes);

  for (const resType of resultTypes)
  {
    const resTypeName = resultTypeNameAssignments.get(resType);
    if (resTypeName == null)
      throw new Error(`Error: result type name not found for ${JSON.stringify(resType)}.`);

    if ( !writtenTypeNames.has(resTypeName) )
    {
      typeDecls.push(makeResultTypeDeclaration(resType, resultTypeNameAssignments, opts) + '\n');
      writtenTypeNames.add(resTypeName);
    }
  }

  return typeDecls.join('\n');
}

function makeResultTypeDeclaration
  (
    resType: ResultTypeDescriptor,
    resTypeNameAssignments: Map<ResultTypeDescriptor,string>,
    opts: JavaResultTypesSourceGenerationOptions
  )
  : string
{
  const emitRecords: boolean = opts?.javaOptions?.emitRecords ?? true;

  const vis = emitRecords ? '' : 'public ';

  const fieldDecls: string[] = [];
  resType.tableFieldProperties.forEach(f => {
    const fieldType = tableFieldPropertyType(f, resType, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });
  resType.tableExpressionProperties.forEach(f => {
    const fieldType = tableExpressionPropertyType(f, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });
  resType.parentReferenceProperties.forEach(f => {
    const fieldType = parentReferencePropertyType(f, resTypeNameAssignments, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });
  resType.childCollectionProperties.forEach(f => {
    const fieldType = childCollectionPropertyType(f, resTypeNameAssignments, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });

  const resTypeName = resTypeNameAssignments.get(resType)!;

  if (emitRecords) return (
    `public record ${resTypeName}(\n` +
      indentLines(fieldDecls.join(',\n'), 2) + '\n' +
    '){}'
  );
  else return (
    '@SuppressWarnings("nullness") // because fields will be set directly by the deserializer not by constructor\n' +
    `public static class ${resTypeName}\n` +
    '{\n' +
      indentLines(fieldDecls.join(';\n'), 2) + ';\n' +
    '}'
  );
}

function tableFieldPropertyType
  (
    tfp: TableFieldProperty,
    inResType: ResultTypeDescriptor,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  if (tfp.specifiedSourceCodeFieldType != null)
    return specifiedSourceCodeFieldType(tfp.specifiedSourceCodeFieldType, opts);

  const customizedType = opts.customPropertyTypeFn && opts.customPropertyTypeFn(tfp, inResType);
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
      else throw new Error(`unsupported type for database field '${tfp.name}' of type '${tfp.databaseType}'`);
  }
}

function tableExpressionPropertyType
  (
    tep: TableExpressionProperty,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  if (!tep.specifiedSourceCodeFieldType) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${tep.name}.`);

  return specifiedSourceCodeFieldType(tep.specifiedSourceCodeFieldType, opts);
}

function specifiedSourceCodeFieldType
  (
    specSourceCodeFieldType: string | {[srcLang: string]: string},
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  switch (typeof specSourceCodeFieldType)
  {
    case 'string':
      return specSourceCodeFieldType;
    default:
      if ( !(opts.sourceLanguage in specSourceCodeFieldType) ) throw new Error(
        `Expression type for language ${opts.sourceLanguage} not specified for table expression property ${specSourceCodeFieldType}.`
      );
      return specSourceCodeFieldType[opts.sourceLanguage];
  }
}

function parentReferencePropertyType
  (
    f: ParentReferenceProperty,
    resTypeNames: Map<ResultTypeDescriptor,string>,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  const parentTypeName = resTypeNames.get(f.refResultType)!;
  return withNullability(f.nullable, parentTypeName);
}

function childCollectionPropertyType
  (
    p: ChildCollectionProperty,
    resTypeNames: Map<ResultTypeDescriptor,string>,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  const collElType = p.elResultType.unwrapped ?
    getSolePropertyType(p.elResultType, resTypeNames, opts)
    : resTypeNames.get(p.elResultType)!; // a regular (wrapped) child record is never nullable itself, by its nature

  return withNullability(p.nullable, `List<${toReferenceType(collElType)}>`);
}

function getSolePropertyType
  (
    resType: ResultTypeDescriptor,
    resTypeNames: Map<ResultTypeDescriptor,string>,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  if (propertiesCount(resType) !== 1)
    throw new Error(`Expected single field when unwrapping result type ${JSON.stringify(resType)}.`);

  if (resType.tableFieldProperties.length === 1)
    return tableFieldPropertyType(resType.tableFieldProperties[0], resType, opts);
  else if (resType.tableExpressionProperties.length === 1)
    return tableExpressionPropertyType(resType.tableExpressionProperties[0], opts);
  else if (resType.childCollectionProperties.length === 1)
    return childCollectionPropertyType(resType.childCollectionProperties[0], resTypeNames, opts);
  else if (resType.parentReferenceProperties.length === 1)
    return parentReferencePropertyType(resType.parentReferenceProperties[0], resTypeNames, opts);
  else
    throw new Error(`Unhandled field category when unwrapping ${JSON.stringify(resType)}.`);
}

function generalNumericTableFieldPropertyType(fp: TableFieldProperty): string
{
  if (fp.fractionalDigits == null || fp.fractionalDigits > 0)
    return withNullability(fp.nullable, 'BigDecimal');
  else // no fractional part
  {
    const primTypeName = fp.precision == null || fp.precision > 9 ? "long" : "int";
    return withNullability(fp.nullable, primTypeName);
  }
}

function floatingNumericTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, "double");
}

function textTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, "String");
}

function booleanTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, "boolean");
}

function jsonTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, 'JsonNode');
}

function withNullability
  (
    maybeNullable: boolean | null,
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

function assignResultTypeNames(resTypes: ResultTypeDescriptor[]): Map<ResultTypeDescriptor,string>
{
  const rtHash = (rt: ResultTypeDescriptor) => hashString(rt.table) +
    3 * rt.tableFieldProperties.length +
    17 * rt.parentReferenceProperties.length +
    27 * rt.childCollectionProperties.length;

  const m = new Map<ResultTypeDescriptor,string>();
  const typeNames = new Set<string>();

  for (const eqGrp of partitionByEquality(resTypes, rtHash, resultTypeDecriptorsEqual) )
  {
    const typeName = makeNameNotInSet(upperCamelCase(eqGrp[0].table), typeNames, '_');
    for (const resType of eqGrp)
      m.set(resType, typeName);
    typeNames.add(typeName);
  }

  return m;
}

function makeQueryResultReprToSqlPathMap
  (
    queryName: string,
    queryReprPathsAllQueries: QueryReprSqlPath[]
  )
  : Map<ResultRepr, string>
{
  const res = new Map<ResultRepr, string>();
  for (const qrp of queryReprPathsAllQueries)
  {
    if (qrp.queryName === queryName)
    {
      if ( res.has(qrp.resultRepr) )
        throw new Error(`Duplicate query representation path encountered for query ${qrp.queryName}.`);

      res.set(qrp.resultRepr, qrp.sqlPath);
    }
  }
  return res;
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

function makeCompilationUnitName(queryName: string): string
{
  return upperCamelCase(queryName);
}

type JavaResultTypesSourceGenerationOptions =
  ResultTypesSourceGenerationOptions &
  { javaOptions?: JavaSourceGenerationOptions };
