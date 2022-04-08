import * as path from 'path';
import { upperCamelCase, readTextFileSync, Nullable } from '../../util/mod';
import { ResultRepr } from '../../query-specs';
import {
  NamedResultTypeSpec, ChildCollectionResultTypeProperty, TableFieldResultTypeProperty,
  TableExpressionResultTypeProperty, ParentReferenceResultTypeProperty, requireNamedResultType,
} from '../result-type-specs';
import { ResultTypesSourceGenerationOptions } from '../../source-generation-options';
import { GeneratedResultTypes } from "../generated-result-types";
import { QueryReprSqlPath } from "../query-repr-sql-path";

export default function makeSource
  (
    resultTypeSpecs: NamedResultTypeSpec[],
    queryName: string,
    sqlPaths: QueryReprSqlPath[],
    queryParamNames: string[],
    opts: ResultTypesSourceGenerationOptions
  )
  : GeneratedResultTypes
{
  return {
    compilationUnitName: makeCompilationUnitName(queryName),
    resultTypeSpecs,
    resultTypesSourceCode:
      generalTypesFileHeader(opts.typesHeaderFile) +
      (opts.typesHeaderFile || '') + '\n\n' +
      '// The types defined in this file correspond to results of the following generated SQL queries.\n' +
      sqlFileReferences(queryName, sqlPaths, opts.sqlResourcePathPrefix) + "\n\n" +
      '// query parameters\n' +
      queryParamDefinitions(queryParamNames) + '\n\n' +
      '// Below are types representing the result data for the generated query, with top-level type first.\n' +
      resultTypeDeclarations(resultTypeSpecs, opts)
  };
}

function generalTypesFileHeader(typesHeaderFile: Nullable<string>): string
{
  if (typesHeaderFile != null) return readTextFileSync(typesHeaderFile) + "\n";
  else return '';
}

function sqlFileReferences
  (
    queryName: string,
    queryReprSqlPaths: QueryReprSqlPath[],
    sqlResourcePathPrefix: Nullable<string>,
  )
  : string
{
  const lines = [];
  const sqlPathsByRepr = makeQueryResultReprToSqlPathMap(queryName, queryReprSqlPaths);

  for ( const repr of Array.from(sqlPathsByRepr.keys()).sort() )
  {
    const memberName = 'sqlResource' + (sqlPathsByRepr.size == 1 ? '' : upperCamelCase(repr));
    const resourceName = (sqlResourcePathPrefix || '') + path.basename(sqlPathsByRepr.get(repr) || '');
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
    opts: ResultTypesSourceGenerationOptions
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
    opts: ResultTypesSourceGenerationOptions
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
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  if (!prop.specifiedSourceCodeFieldType) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${prop.propertyName}.`);

  return specifiedSourceCodeFieldType(prop.specifiedSourceCodeFieldType, opts);
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
    opts: ResultTypesSourceGenerationOptions
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

function getSolePropertyType
  (
    resType: NamedResultTypeSpec,
    opts: ResultTypesSourceGenerationOptions
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
function makeCompilationUnitName(queryName: string): string
{
  return queryName.replace(/ /g, '-').toLowerCase();
}