import * as fs from 'fs/promises';
import * as path from 'path';

import {upperCamelCase} from './util/strings';
import {ResultRepr} from './query-specs';
import {
  ResultType,
  ChildCollectionProperty,
  SimpleTableFieldProperty,
  TableExpressionProperty,
  ParentReferenceProperty,
  fieldsCount
} from './result-types';
import {QueryReprSqlPath} from './query-repr-sql-path';

export class TSModulesWriter
{
  constructor
  (
    private readonly sourceOutputDir: string,
    private readonly sqlResourceNamePrefix: string,
    private readonly filesHeader: string | null,
  )
  {}

  async writeModule
    (
      queryName: string,
      resultTypes: ResultType[],
      paramNames: string[],
      sqlPaths: QueryReprSqlPath[],
      queryFileHeader: string | null
    )
    : Promise<void>
  {
    const commonHeader = this.getCommonFileHeader();

    const moduleSrc =
      commonHeader +
      (queryFileHeader || "") + "\n" +
      this.getSqlReferenceDefinitions(queryName, sqlPaths) + "\n\n" +
      "// Below are types representing the result data for the generated query referenced above.\n" +
      "// The top-level result type is listed first.\n" +
      paramDefinitions(paramNames) + "\n" +
      this.getTypeDeclarations(resultTypes);

     await fs.writeFile(this.getOutputFilePath(queryName), moduleSrc);
  }

  getCommonFileHeader(): string
  {
    return (
      "// ---------------------------------------------------------------------------\n" +
      "// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
      "// ---------------------------------------------------------------------------\n" +
      ( this.filesHeader != null ? this.filesHeader + "\n" : "")
    );
  }

  private getSqlReferenceDefinitions
    (
      queryName: string,
      queryReprSqlPaths: QueryReprSqlPath[]
    )
    : string
  {
    const lines = [];
    const sqlPathsByRepr = getReprToSqlPathMapForQuery(queryName, queryReprSqlPaths);

    for ( const repr of Array.from(sqlPathsByRepr.keys()).sort() )
    {
      const memberName = "sqlResource" + (sqlPathsByRepr.size == 1 ? "" : upperCamelCase(repr));
      const resourceName = this.sqlResourceNamePrefix + path.basename(sqlPathsByRepr.get(repr) || '');
      lines.push("export const " + memberName + " = \"" + resourceName + "\";");
    }

    return lines.join("\n") + "\n";
  }

  private getTypeDeclarations(resultTypes: ResultType[]): string
  {
    if ( resultTypes.length === 0 )
       return "";

    const parts: string[] = [];
    const writtenTypeNames = new Set();

    for ( const resultType of resultTypes )
    {
      if ( !writtenTypeNames.has(resultType.typeName) && !resultType.unwrapped )
      {
        parts.push(this.getTypeDeclaration(resultType) + "\n");
        writtenTypeNames.add(resultType.typeName);
      }
    }

    return parts.join("\n");
  }

  private getTypeDeclaration(resType: ResultType): string
  {
    const lines: string[] = [];

    lines.push(`export interface ${resType.typeName}`);
    lines.push("{");

    resType.simpleTableFieldProperties.forEach(f =>
      lines.push(`   ${f.name}: ${getSimpleTableFieldPropertyTSType(f)};`)
    );
    resType.tableExpressionProperty.forEach(f =>
      lines.push(`   ${f.name}: ${getTableExpressionPropertyTSType(f)};`)
    );
    resType.parentReferenceProperties.forEach(f =>
      lines.push(`   ${f.name}: ${getParentReferencePropertyTSType(f)};`)
    );
    resType.childCollectionProperties.forEach(f =>
      lines.push(`   ${f.name}: ${getChildCollectionPropertyTSType(f)};`)
    );

    lines.push("}")

    return lines.join("\n");
  }

  getOutputFilePath(queryName: string): string
  {
    const moduleName = this.makeModuleName(queryName);
    return path.join(this.sourceOutputDir, moduleName + ".ts");
  }

  makeModuleName(queryName: string): string
  {
    return queryName.replace(/ /g, '-').toLowerCase();
  }
}

function getReprToSqlPathMapForQuery
  (
    queryName: string,
    queryReprPathsAllQueries: QueryReprSqlPath[]
  )
  : Map<ResultRepr, string>
{
  const res = new Map<ResultRepr, string>();

  for ( const qrp of queryReprPathsAllQueries )
  {
    if ( qrp.queryName === queryName )
    {
      if ( res.has(qrp.resultRepr) )
        throw new Error(`Duplicate query representation path encountered for query ${qrp.queryName}.`);

      res.set(qrp.resultRepr, qrp.sqlPath);
    }
  }

  return res;
}

function getSimpleTableFieldPropertyTSType(f: SimpleTableFieldProperty): string
{
  if ( f.specifiedSourceCodeFieldType != null )
    return f.specifiedSourceCodeFieldType;

  const notNull = !(f.nullable != null ? f.nullable : true);

  // TODO: Need to review Oracle and Postgres types and add additional ones here.
  switch ( f.databaseType.toLowerCase() )
  {
    case 'number':
    case 'numeric':
    case 'int':
    case 'int4':
    case 'int8':
    case 'smallint':
    case 'bigint':
    case 'decimal':
    case 'float':
    case 'real':
    case 'double':
      return notNull ? "number" : "number | null";
    case 'varchar':
    case 'text':
    case 'longvarchar':
    case 'char':
    case 'clob':
    case 'date':
    case 'time':
    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamptz':
      return notNull ? "string" : "string | null";
    case 'bit':
    case 'boolean':
      return notNull ? "boolean" : "boolean | null";
    case 'json':
    case 'jsonb':
      return notNull ? "any" : "any | null";
    default:
      throw new Error(`unsupported type for database field ${f} of type ${f.databaseType}`);
  }
}

function getTableExpressionPropertyTSType(tep: TableExpressionProperty): string
{
  if ( !tep.specifiedSourceCodeFieldType ) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${tep.name}.`);

  return tep.specifiedSourceCodeFieldType;
}

function getParentReferencePropertyTSType(f: ParentReferenceProperty): string
{
  return f.resultType.typeName + (f.nullable ?  " | null" : "");
}

function getChildCollectionPropertyTSType(f: ChildCollectionProperty): string
{
  const collElType = !f.resultType.unwrapped ? f.resultType.typeName : getSoleFieldDeclaredType(f.resultType);
  const bareCollType = `${collElType}[]`;
  return !f.nullable ? bareCollType : `${bareCollType} | null`;
}

function getSoleFieldDeclaredType(resType: ResultType): string
{
  if ( fieldsCount(resType) !== 1 )
    throw new Error(`Expected single field when unwrapping ${resType.typeName}.`);

  if ( resType.simpleTableFieldProperties.length === 1 )
    return getSimpleTableFieldPropertyTSType(resType.simpleTableFieldProperties[0]);
  else if ( resType.tableExpressionProperty.length === 1 )
    return getTableExpressionPropertyTSType(resType.tableExpressionProperty[0]);
  else if ( resType.childCollectionProperties.length === 1 )
    return getChildCollectionPropertyTSType(resType.childCollectionProperties[0]);
  else if ( resType.parentReferenceProperties.length === 1 )
    return getParentReferencePropertyTSType(resType.parentReferenceProperties[0]);
  else
    throw new Error(`Unhandled field category when unwrapping ${resType.typeName}.`);
}

function paramDefinitions(paramNames: string[]): string
{
  return paramNames
    .map(paramName => `export const ${paramName}Param = '${paramName}';`)
    .join("\n\n");
}
