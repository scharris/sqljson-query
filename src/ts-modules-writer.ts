import * as fs from 'fs/promises';
import * as path from 'path';
import {hashString, upperCamelCase, partitionByEquality, makeNameNotInSet} from './util';
import {ResultRepr} from './query-specs';
import {
  ResultType, ChildCollectionProperty, SimpleTableFieldProperty, TableExpressionProperty,
  ParentReferenceProperty, propertiesCount, resultTypesEqual
} from './result-types';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {SourceGenerationOptions} from '.';

export class TSModulesWriter
{
  constructor
    (
      private readonly sourceOutputDir: string,
      private opts: SourceGenerationOptions
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
    const commonHeader = await this.getCommonFileHeader();

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

  async getCommonFileHeader(): Promise<string>
  {
    return (
      "// ---------------------------------------------------------------------------\n" +
      "// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
      "// ---------------------------------------------------------------------------\n" +
      (this.opts.typesHeaderFile != null ?
        (await fs.readFile(this.opts.typesHeaderFile, 'utf8')) + "\n" : "")
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
      const resourceName = this.opts.sqlResourcePathPrefix + path.basename(sqlPathsByRepr.get(repr) || '');
      lines.push("export const " + memberName + " = \"" + resourceName + "\";");
    }

    return lines.join("\n") + "\n";
  }

  private getTypeDeclarations(resultTypes: ResultType[]): string
  {
    if ( resultTypes.length === 0 )
       return "";

    const resultTypeNames: Map<ResultType,string> = makeResultTypeNames(resultTypes);

    const parts: string[] = [];
    const writtenTypeNames = new Set();

    for ( const resultType of resultTypes )
    {
      const resultTypeName = resultTypeNames.get(resultType);
      if ( resultTypeName == null )
        throw new Error(`Error: result type name not found for ${JSON.stringify(resultType)}.`);
      if ( !writtenTypeNames.has(resultTypeName) )
      {
        parts.push(this.getTypeDeclaration(resultType, resultTypeName, resultTypeNames) + "\n");
        writtenTypeNames.add(resultTypeName);
      }
    }

    return parts.join("\n");
  }

  private getTypeDeclaration
    (
      resType: ResultType,
      resTypeName: string,
      resTypeNames: Map<ResultType,string>
    ): string
  {
    const lines: string[] = [];

    lines.push(`export interface ${resTypeName}`);
    lines.push("{");

    resType.simpleTableFieldProperties.forEach(f =>
      lines.push(`   ${f.name}: ${this.getSimpleTableFieldPropertyTSType(f, resType)};`)
    );
    resType.tableExpressionProperty.forEach(f =>
      lines.push(`   ${f.name}: ${this.getTableExpressionPropertyTSType(f)};`)
    );
    resType.parentReferenceProperties.forEach(f =>
      lines.push(`   ${f.name}: ${this.getParentReferencePropertyTSType(f, resTypeNames)};`)
    );
    resType.childCollectionProperties.forEach(f =>
      lines.push(`   ${f.name}: ${this.getChildCollectionPropertyTSType(f, resTypeNames)};`)
    );

    lines.push("}")

    return lines.join("\n");
  }

  private getSimpleTableFieldPropertyTSType
    (
      fp: SimpleTableFieldProperty,
      inResType: ResultType
    )
    : string
  {
    if ( fp.specifiedSourceCodeFieldType != null )
      return fp.specifiedSourceCodeFieldType;
    
    const customizedType = this.opts.customPropertyTypeFn && this.opts.customPropertyTypeFn(fp, inResType);
    if ( customizedType )
      return customizedType;

    const notNull = !(fp.nullable != null ? fp.nullable : true);

    const lcDbFieldType = fp.databaseType.toLowerCase();

    switch (lcDbFieldType)
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
        return notNull ? "string" : "string | null";
      case 'bit':
      case 'boolean':
        return notNull ? "boolean" : "boolean | null";
      case 'json':
      case 'jsonb':
        return notNull ? "any" : "any | null";
      default:
        if (lcDbFieldType.startsWith("timestamp"))
          return notNull ? "string" : "string | null";
        throw new Error(`unsupported type for database field ${fp.name} of type ${fp.databaseType}`);
    }
  }

  private getTableExpressionPropertyTSType(tep: TableExpressionProperty): string
  {
    if (!tep.specifiedSourceCodeFieldType) // This should have been caught in validation.
      throw new Error(`Generated field type is required for table expression property ${tep.name}.`);

    return tep.specifiedSourceCodeFieldType;
  }

  private getParentReferencePropertyTSType
    (
      f: ParentReferenceProperty,
      resTypeNames: Map<ResultType,string>
    )
    : string
  {
    return resTypeNames.get(f.refResultType)! + (f.nullable ? " | null" : "");
  }

  private getChildCollectionPropertyTSType
    (
      p: ChildCollectionProperty,
      resTypeNames: Map<ResultType,string>
    )
    : string
  {
    const collElType = p.elResultType.unwrapped ? this.getSolePropertyDeclaredType(p.elResultType, resTypeNames)
      : resTypeNames.get(p.elResultType);
    const bareCollType = `${collElType}[]`;
    return !p.nullable ? bareCollType : `${bareCollType} | null`;
  }

  private getSolePropertyDeclaredType
    (
      resType: ResultType,
      resTypeNames: Map<ResultType,string>
    )
    : string
  {
    if (propertiesCount(resType) !== 1)
      throw new Error(`Expected single field when unwrapping result type ${JSON.stringify(resType)}.`);

    if (resType.simpleTableFieldProperties.length === 1)
      return this.getSimpleTableFieldPropertyTSType(resType.simpleTableFieldProperties[0], resType);
    else if (resType.tableExpressionProperty.length === 1)
      return this.getTableExpressionPropertyTSType(resType.tableExpressionProperty[0]);
    else if (resType.childCollectionProperties.length === 1)
      return this.getChildCollectionPropertyTSType(resType.childCollectionProperties[0], resTypeNames);
    else if (resType.parentReferenceProperties.length === 1)
      return this.getParentReferencePropertyTSType(resType.parentReferenceProperties[0], resTypeNames);
    else
      throw new Error(`Unhandled field category when unwrapping ${JSON.stringify(resType)}.`);
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

function makeResultTypeNames(resTypes: ResultType[]): Map<ResultType,string>
{
  const m = new Map<ResultType,string>();

  const rtHash = (rt: ResultType) => hashString(rt.table) +
    3 * rt.simpleTableFieldProperties.length +
    17 * rt.parentReferenceProperties.length +
    27 * rt.childCollectionProperties.length;

  const typeNames = new Set<string>();

  for (const eqGrp of partitionByEquality(resTypes, rtHash, resultTypesEqual) )
  {
    const typeName = makeNameNotInSet(upperCamelCase(eqGrp[0].table), typeNames, '_');

    for (const resType of eqGrp)
      m.set(resType, typeName);

    typeNames.add(typeName);
  }

  return m;
}

function paramDefinitions(paramNames: string[]): string
{
  return paramNames
    .map(paramName => `export const ${paramName}Param = '${paramName}';`)
    .join("\n\n");
}
