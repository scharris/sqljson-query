import { upperCamelCase, Nullable } from '../../util/mod';
import { QueryTypesFileHeader, ResultRepr } from '../../query-specs';
import {
  NamedResultTypeSpec, ChildCollectionResultTypeProperty, TableFieldResultTypeProperty,
  TableExpressionResultTypeProperty, ParentReferenceResultTypeProperty, requireNamedResultType,
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
  return {
    compilationUnitName: makeCompilationUnitNameNoExt(queryName) + '.ts',
    sourceCode:
      typesFileHeaders(opts, queryTypesFileHeader) + '\n\n' +
      '// The types defined in this file correspond to results of the following generated SQL queries.\n' +
      sqlFileReferences(sqlResources) + "\n\n" +
      '// query parameters\n' +
      queryParamDefinitions(queryParamNames) + '\n\n' +
      '// Below are types representing the result data for the generated query, with top-level type first.\n' +
      resultTypeDeclarations(resultTypeSpecs, opts)
  };
}

function typesFileHeaders
  (
    opts: SourceGenerationOptions,
    queryTypesFileHeader: Nullable<QueryTypesFileHeader>
  )
  : string
{
  const generalHeaders = opts?.typesHeaders?.get('TS');
  return (generalHeaders ? generalHeaders + '\n' : '') +
    queryTypesFileHeader == null ? '' :
      (typeof queryTypesFileHeader === 'string'
        ? queryTypesFileHeader
        : queryTypesFileHeader?.TS ?? '');

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
    lines.push(`export const ${memberName} = "${resourceName}";`); break;
  }

  return lines.join('\n') + '\n';
}

function queryParamDefinitions(paramNames: string[]): string
{
  const makeParamDecl = (paramName: string) => `export const ${paramName}Param = '${paramName}';`;
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
  const decls = resType.properties.map(prop => {
    switch(prop.type)
    {
      case 'rtp-field':
        return `  ${prop.propertyName}: ${tableFieldType(prop, resType, opts)};`;
      case 'rtp-expr':
        return `  ${prop.propertyName}: ${tableExprType(prop, opts)};`;
      case 'rtp-parent-ref':
        return `  ${prop.propertyName}: ${parentRefType(prop)};`;
      case 'rtp-child-coll':
        return `  ${prop.propertyName}: ${childCollType(prop, opts)};`;
    }
  });

  return (
    `export interface ${resType.resultTypeName}\n` +
    '{\n' +
      decls.join('\n') + '\n' +
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

  const customizedType = opts.customPropertyTypeFn && opts.customPropertyTypeFn(tfp, inResType, 'TS');
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
      return withNullability(tfp.nullable, 'number');
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
      else
        throw new Error(`unsupported type for field '${tfp.databaseFieldName}' of type '${tfp.databaseType}'`);
  }
}

function tableExprType
  (
    prop: TableExpressionResultTypeProperty,
    opts: SourceGenerationOptions
  )
  : string
{
  if (!prop.specifiedSourceCodeFieldType) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${prop.propertyName}.`);

  return specifiedSourceCodeFieldType(prop.specifiedSourceCodeFieldType);
}

function parentRefType
  (
    prop: ParentReferenceResultTypeProperty,
  )
  : string
{
  const parentTypeName = prop.refResultType.resultTypeName!;
  return withNullability(prop.nullable, parentTypeName);
}

function childCollType
  (
    p: ChildCollectionResultTypeProperty,
    opts: SourceGenerationOptions
  )
  : string
{
  const collElType = p.elResultType.unwrapped ?
    getSolePropertyType(requireNamedResultType(p.elResultType), opts)
    : p.elResultType.resultTypeName!;

  return withNullability(p.nullable, `${collElType}[]`);
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
      if ( !('TS' in specSourceCodeFieldType) )
        throw new Error(
          `Expression type for language 'TS' not specified for table expression ` +
          `property ${specSourceCodeFieldType}.`
        );
      return specSourceCodeFieldType['TS'];
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

function floatingNumericTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, 'number');
}

function textTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, 'string');
}

function booleanTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, 'boolean');
}

function jsonTableFieldPropertyType(fp: TableFieldResultTypeProperty): string
{
  return withNullability(fp.nullable, 'any');
}

function withNullability
  (
    maybeNullable: Nullable<boolean>,
    typeName: string,
  )
  : string
{
  const nullable = maybeNullable == null ? true : maybeNullable;
  return typeName + (nullable ? ' | null' : '');
}

function makeCompilationUnitNameNoExt(queryName: string): string
{
  return queryName.replace(/ /g, '-').toLowerCase();
}