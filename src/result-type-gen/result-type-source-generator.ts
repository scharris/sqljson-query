import { getQueryParamNames, QuerySpec } from '../query-specs';
import { ResultTypeDescriptorGenerator } from './result-type-descriptor-generator';
import { ResultTypesSourceGenerationOptions } from '../source-gen-options';
import { DatabaseMetadata } from '../dbmd';
import { QueryReprSqlPath, ResultTypesSource } from './common-types';
import { makeTypeScriptSource } from './ts-result-types';
import { makeJavaSource } from './java-result-types';

export class ResultTypeSourceGenerator
{
  readonly resTypeDescGen: ResultTypeDescriptorGenerator;

  constructor
    (
      dbmd: DatabaseMetadata,
      defaultSchema: string | null,
      defaultPropertyNameFn : (fieldName: string) => string
    )
  {
    this.resTypeDescGen = new ResultTypeDescriptorGenerator(dbmd, defaultSchema, defaultPropertyNameFn);
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
    const resTypeDescs = this.resTypeDescGen.generateResultTypeDescriptors(querySpec.tableJson, qName);
    const qParams = getQueryParamNames(querySpec);
    const qTypesHdr = querySpec.typesFileHeader;

    switch (opts.sourceLanguage)
    {
      case 'TS':   return makeTypeScriptSource(qName, resTypeDescs, qTypesHdr, qParams, sqlPaths, opts);
      case 'Java': return makeJavaSource(qName, resTypeDescs, qTypesHdr, qParams, sqlPaths, opts);
    }
  }
}
