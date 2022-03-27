import * as path from 'path';
import { upperCamelCase, readTextFileSync, sorted } from '../../util/mod';
import { ResultRepr } from '../../query-specs';
import {
  ResultTypeSpec, ChildCollectionProperty, TableFieldProperty, TableExpressionProperty,
  ParentReferenceProperty, propertiesCount,
} from '../result-type-spec-generator';
import { ResultTypesSourceGenerationOptions } from '../../source-gen-options';
import { QueryReprSqlPath, ResultTypesSource } from '../common-types';
import { assignResultTypeNames } from '../result-type-names-assignment';

export default function makeSource
  (
    queryName: string,
    resultTypes: ResultTypeSpec[],
    queryTypesFileHeader: string | undefined,
    queryParamNames: string[],
    sqlPaths: QueryReprSqlPath[],
    opts: ResultTypesSourceGenerationOptions
  )
  : ResultTypesSource
{
  return {
    compilationUnitName: makeCompilationUnitName(queryName),
    sourceCode:
      generalTypesFileHeader(opts.typesHeaderFile) +
      (queryTypesFileHeader || '') + '\n\n' +
      '// The types defined in this file correspond to results of the following generated SQL queries.\n' +
      sqlFileReferences(queryName, sqlPaths, opts.sqlResourcePathPrefix) + "\n\n" +
      '// query parameters\n' +
      queryParamDefinitions(queryParamNames) + '\n\n' +
      '// Below are types representing the result data for the generated query, with top-level type first.\n' +
      resultTypeDeclarations(resultTypes, opts)
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
    sqlResourcePathPrefix: string | undefined
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
    resultTypes: ResultTypeSpec[],
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  if (resultTypes.length === 0) return '';

  const typeDecls: string[] = [];
  const writtenTypeNames = new Set();

  const resultTypeNameAssignments: Map<ResultTypeSpec,string> = assignResultTypeNames(resultTypes);

  for (const resType of resultTypes)
  {
    const resTypeName = resultTypeNameAssignments.get(resType);
    if (resTypeName == null)
      throw new Error(`Error: result type name not found for ${JSON.stringify(resType)}.`);

    if (!writtenTypeNames.has(resTypeName))
    {
      typeDecls.push(makeResultTypeDeclaration(resType, resultTypeNameAssignments, opts) + '\n');
      writtenTypeNames.add(resTypeName);
    }
  }

  return typeDecls.join('\n');
}

function makeResultTypeDeclaration
  (
    resType: ResultTypeSpec,
    resTypeNameAssignments: Map<ResultTypeSpec,string>,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  const decls: { decl: string; displayOrder: number }[] = [];

  resType.tableFieldProperties.forEach(prop => decls.push({
    decl: `  ${prop.name}: ${tableFieldPropertyType(prop, resType, opts)};`,
    displayOrder: prop.displayOrder ?? (decls.length + 1)
  }));
  resType.tableExpressionProperties.forEach(prop => decls.push({
    decl: `  ${prop.name}: ${tableExpressionPropertyType(prop, opts)};`,
    displayOrder: prop.displayOrder ?? (decls.length + 1)
  }));
  resType.parentReferenceProperties.forEach(prop => decls.push({
    decl: `  ${prop.name}: ${parentReferencePropertyType(prop, resTypeNameAssignments, opts)};`,
    displayOrder: prop.displayOrder ?? (decls.length + 1)
  }));
  resType.childCollectionProperties.forEach(prop => decls.push({
    decl: `  ${prop.name}: ${childCollectionPropertyType(prop, resTypeNameAssignments, opts)};`,
    displayOrder: prop.displayOrder ?? (decls.length + 1)
  }));

  const resTypeName = resTypeNameAssignments.get(resType)!;

  return (
    `export interface ${resTypeName}\n` +
    '{\n' +
      sorted(decls, (decl1, decl2) => (decl1.displayOrder ?? 0) - (decl2.displayOrder ?? 0))
      .map(decl => decl.decl)
      .join('\n') + '\n' +
    '}'
  );
}

function tableFieldPropertyType
  (
    tfp: TableFieldProperty,
    inResType: ResultTypeSpec,
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
    resTypeNames: Map<ResultTypeSpec,string>,
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
    resTypeNames: Map<ResultTypeSpec,string>,
    opts: ResultTypesSourceGenerationOptions
  )
  : string
{
  const collElType = p.elResultType.unwrapped ?
    getSolePropertyType(p.elResultType, resTypeNames, opts)
    : resTypeNames.get(p.elResultType)!; // a regular (wrapped) child record is never nullable itself, by its nature

  return withNullability(p.nullable, `${collElType}[]`);
}

function getSolePropertyType
  (
    resType: ResultTypeSpec,
    resTypeNames: Map<ResultTypeSpec,string>,
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

function floatingNumericTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, 'number');
}

function textTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, 'string');
}

function booleanTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, 'boolean');
}

function jsonTableFieldPropertyType(fp: TableFieldProperty): string
{
  return withNullability(fp.nullable, 'any');
}

function withNullability
  (
    maybeNullable: boolean | null,
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
