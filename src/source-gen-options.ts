import { ResultTypeDescriptor, TableFieldProperty } from './result-type-gen';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn = (prop: TableFieldProperty, resultType: ResultTypeDescriptor) => string | null;

export interface CommonSourceGenerationOptions
{
  sourceLanguage?: SourceLanguage;
  resultTypesOutputDir: string;
  sqlOutputDir: string;
  sqlSpecOutputDir?: string;
  sqlResourcePathPrefix?: string;
  typesHeaderFile?: string;
  customPropertyTypeFn?: CustomPropertyTypeFn;
}

export type SourceGenerationOptions =
  { sourceLanguage: 'TS' } & CommonSourceGenerationOptions |
  { sourceLanguage: 'Java', javaOptions?: JavaSourceGenerationOptions } & CommonSourceGenerationOptions

export interface JavaSourceGenerationOptions
{
  javaPackage?: string;
  emitRecords?: boolean;
}
export type ResultTypesSourceGenerationOptions = Omit<SourceGenerationOptions, 'resultTypesOutputDir'|'sqlOutputDir'>;
