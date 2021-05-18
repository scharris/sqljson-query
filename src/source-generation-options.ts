import {ResultType, TableFieldProperty} from './result-types';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn = (prop: TableFieldProperty, resultType: ResultType) => string | null;

export interface SourceGenerationOptions
{
  sourceLanguage?: SourceLanguage;
  sqlResourcePathPrefix?: string;
  typesHeaderFile?: string;
  customPropertyTypeFn?: CustomPropertyTypeFn;
}
