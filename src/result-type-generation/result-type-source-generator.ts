import { ResultTypesSourceGenerationOptions } from '../source-generation-options';
import { GeneratedResultTypes } from "./generated-result-types";
import { QueryReprSqlPath } from "./query-repr-sql-path";
import makeTypeScriptSource from './source-emmitters/ts';
import makeJavaSource from './source-emmitters/java';
import { SqlSpec } from '../sql-generation/sql-specs';
import { makeNamedResultTypeSpecs } from './result-type-spec-generator';

export function makeQueryResultTypesSource
  (
    sqlSpec: SqlSpec,
    queryName: string,
    sqlPaths: QueryReprSqlPath[],
    queryParamNames: string[],
    opts: ResultTypesSourceGenerationOptions
  )
  : GeneratedResultTypes
{
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  switch (opts.sourceLanguage)
  {
    case 'TS':
      return makeTypeScriptSource(resultTypes, queryName, sqlPaths, queryParamNames, opts);
    case 'Java':
      return makeJavaSource(resultTypes, queryName, sqlPaths, queryParamNames, opts);
  }
}