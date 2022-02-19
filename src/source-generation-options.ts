import {ResultType, TableFieldProperty} from './result-types';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn = (prop: TableFieldProperty, resultType: ResultType) => string | null;

export interface CommonSourceGenerationOptions
{
  sourceLanguage?: SourceLanguage;
  sqlResourcePathPrefix?: string;
  typesHeaderFile?: string;
  customPropertyTypeFn?: CustomPropertyTypeFn;
}

export type SourceGenerationOptions =
  { sourceLanguage: 'TS' } & CommonSourceGenerationOptions |
  { sourceLanguage: 'Java', javaOptions: JavaSourceGenerationOptions } & CommonSourceGenerationOptions

export interface JavaSourceGenerationOptions
{
  javaPackage?: string;
  emitRecords?: boolean;
}
