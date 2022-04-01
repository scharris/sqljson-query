import { ResultTypeSpec, TableFieldResultTypeProperty } from './result-type-generation';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn =
  (prop: TableFieldResultTypeProperty, resultType: ResultTypeSpec) => string | null;

export interface CommonSourceGenerationOptions
{
  sourceLanguage?: SourceLanguage;
  resultTypesOutputDir: string;
  sqlOutputDir: string;
  sqlSpecOutputDir?: string;
  queryPropertiesOutputDir?: string;
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