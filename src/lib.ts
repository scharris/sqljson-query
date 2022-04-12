import {
  propertyNameDefaultFunction, mapValues, firstValue, mapEntries, Nullable, makeMap,
} from './util/mod';
import {
  getQueryParamNames, QueryGroupSpec, QuerySpec, QueryTypesFileHeader, ResultRepr
} from './query-specs';
import {
  makeNamedResultTypeSpecs, makeResultTypesSource, ResultTypeSpec, ResultTypesSource
} from './result-type-generation';
import { SqlSourceGenerator } from './sql-generation/sql-source-generator';
import { SqlSpecGenerator } from './sql-generation/sql-spec-generator';
import { SqlSpec } from './sql-generation/sql-specs';
import { getSqlDialect } from './sql-generation';
import { QueryPropertiesMetadata, makeQueryPropertiesMetadata } from './query-properties-metadata-generation';
import { DatabaseMetadata } from './dbmd';
import { SourceGenerationOptions, SourceLanguage } from './source-generation-options';

export * from './source-generation-options';
export * from './query-specs';
export * from './result-type-generation';

export interface QuerySources
{
  query: QuerySpec,
  generatedSqlsByResultRepr: Map<ResultRepr, GeneratedSql>,
  generatedResultTypes: Nullable<GeneratedResultTypes>,
  queryPropertiesMetadata: QueryPropertiesMetadata,
}

export interface GeneratedSql
{
  readonly sqlSpec: SqlSpec;
  readonly sqlText: string;
  readonly sqlResourceName: string;
}

export interface GeneratedResultTypes
{
  readonly specs: ResultTypeSpec[];
  readonly sourceCodeByLanguage: Map<SourceLanguage, ResultTypesSource>
}

export function generateQueryGroupSources
  (
    queryGroupSpec: QueryGroupSpec,
    dbmd: DatabaseMetadata,
    opts: SourceGenerationOptions
  )
  : QuerySources[]
{
  const defaultSchema = queryGroupSpec.defaultSchema;
  const unqualNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas ?? []);
  const propNameFn = propertyNameDefaultFunction(queryGroupSpec.propertyNameDefault, dbmd.caseSensitivity);

  const sqlSpecGen = new SqlSpecGenerator(dbmd, defaultSchema, propNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, unqualNameSchemas);

  return queryGroupSpec.querySpecs.map(query => {

    const sqlSpecsByResultRepr = sqlSpecGen.generateSqlSpecs(query);

    const generatedSqlsByResultRepr = mapEntries(sqlSpecsByResultRepr, (resultRepr, sqlSpec) => (
      {
        sqlSpec,
        sqlText: sqlSrcGen.makeSql(sqlSpec),
        sqlResourceName: makeSqlResourceName(query.queryName, resultRepr, sqlSpecsByResultRepr.size),
      }
    ));

    const sqlResourceNames = mapValues(generatedSqlsByResultRepr, genSql => genSql.sqlResourceName);
    const paramNames = getQueryParamNames(query);
    const firstSqlSpec = firstValue(sqlSpecsByResultRepr);

    return {
      query,
      generatedSqlsByResultRepr,
      generatedResultTypes: !(query.generateResultTypes ?? true) ? null :
        makeResultTypes(
          firstSqlSpec,
          query.queryName,
          query.typesFileHeader,
          sqlResourceNames,
          paramNames,
          opts
        ),
      queryPropertiesMetadata:
        makeQueryPropertiesMetadata(query.queryName, firstSqlSpec),
    };
  });
}

export function makeSqlResourceName
  (
    queryName: string,
    resultRepr: ResultRepr,
    numReprs: number
  )
  : string
{
  const modQueryName = queryName.replace(/ /g, '-').toLowerCase();
  const reprDescn = resultRepr.toLowerCase().replace(/_/g, ' ');
  return numReprs === 1 ? `${modQueryName}.sql` : `${modQueryName}(${reprDescn}).sql`;
}

function makeResultTypes
  (
    sqlSpec: SqlSpec,
    queryName: string,
    queryTypesFileHeader: Nullable<QueryTypesFileHeader>,
    sqlResourceNames: Map<ResultRepr,string>,
    params: string[],
    opts: SourceGenerationOptions
  )
  : GeneratedResultTypes
{
  const resultTypeSpecs = makeNamedResultTypeSpecs(sqlSpec);

  return {
    specs: resultTypeSpecs,
    sourceCodeByLanguage:
      makeMap(opts.resultTypeLanguages, srcLang => srcLang, srcLang =>
        makeResultTypesSource(
          resultTypeSpecs,
          srcLang,
          queryName,
          queryTypesFileHeader,
          sqlResourceNames,
          params,
          opts
        )
      )
  };
}