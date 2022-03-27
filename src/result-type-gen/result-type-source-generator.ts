import { getQueryParamNames, QuerySpec } from '../query-specs';
import { ResultTypeSpecGenerator } from './result-type-spec-generator';
import { ResultTypesSourceGenerationOptions } from '../source-gen-options';
import { DatabaseMetadata } from '../dbmd';
import { QueryReprSqlPath, ResultTypesSource } from './common-types';
import makeTypeScriptSource from './source-emmitters/ts';
import makeJavaSource from './source-emmitters/java';

export class ResultTypeSourceGenerator
{
  readonly resTypeSpecGen: ResultTypeSpecGenerator;

  constructor
    (
      dbmd: DatabaseMetadata,
      defaultSchema: string | null,
      defaultPropertyNameFn : (fieldName: string) => string
    )
  {
    this.resTypeSpecGen = new ResultTypeSpecGenerator(dbmd, defaultSchema, defaultPropertyNameFn);
  }

  makeQueryResultTypesSource
    (
      querySpec: QuerySpec,
      sqlPaths: QueryReprSqlPath[],
      opts: ResultTypesSourceGenerationOptions
    )
    : ResultTypesSource
  {
    const qName = querySpec.queryName;
    const resTypeSpecs = this.resTypeSpecGen.generateResultTypeSpecs(querySpec.tableJson, qName);
    const qParams = getQueryParamNames(querySpec);
    const qTypesHdr = querySpec.typesFileHeader;

    switch (opts.sourceLanguage)
    {
      case 'TS':   return makeTypeScriptSource(qName, resTypeSpecs, qTypesHdr, qParams, sqlPaths, opts);
      case 'Java': return makeJavaSource(qName, resTypeSpecs, qTypesHdr, qParams, sqlPaths, opts);
    }
  }
}
