import { SourceGenerationOptions, SourceLanguage } from '../source-generation-options';
import { ResultTypesSource } from "./result-types-source";
import makeTypeScriptSource from './source-emmitters/ts';
import makeJavaSource from './source-emmitters/java';
import { NamedResultTypeSpec } from './result-type-specs';
import { QueryTypesFileHeader, ResultRepr } from '../query-specs';
import { Nullable } from '../util/mod';

export function makeResultTypesSource
  (
    resultTypes: NamedResultTypeSpec[],
    sourceLanguage: SourceLanguage,
    queryName: string,
    queryTypesFileHeader: Nullable<QueryTypesFileHeader>,
    sqlPaths: Map<ResultRepr, string>,
    queryParamNames: string[],
    opts: SourceGenerationOptions
  )
  : ResultTypesSource
{
  switch (sourceLanguage)
  {
    case 'TS':
      return makeTypeScriptSource(
        resultTypes,
        queryName,
        queryTypesFileHeader,
        sqlPaths,
        queryParamNames,
        opts
      );
    case 'Java':
      return makeJavaSource(
        resultTypes,
        queryName,
        queryTypesFileHeader,
        sqlPaths,
        queryParamNames,
        opts
      );
  }
}