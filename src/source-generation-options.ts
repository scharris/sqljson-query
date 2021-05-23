import {ResultType, TableFieldProperty} from './result-types.ts';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn = (prop: TableFieldProperty, resultType: ResultType) => string | null;

export interface SourceGenerationOptions
{
  sourceLanguage?: SourceLanguage;
  javaPackage?: string;
  sqlResourcePathPrefix?: string;
  typesHeaderFile?: string;
  customPropertyTypeFn?: CustomPropertyTypeFn;
}
