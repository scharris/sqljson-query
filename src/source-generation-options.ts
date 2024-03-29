import { ResultTypeSpec, TableFieldResultTypeProperty } from './result-type-gen';
import { Nullable } from './util/mod';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn =
  (prop: TableFieldResultTypeProperty,
   resultType: ResultTypeSpec,
   srcLanguage?: SourceLanguage) => string | null;

export interface SourceGenerationOptions
{
  readonly resultTypeLanguages: SourceLanguage[];
  readonly typesHeaders?: Nullable<Map<SourceLanguage,string>>;
  readonly customPropertyTypeFn?: Nullable<CustomPropertyTypeFn>;
  readonly javaPackage?: Nullable<string>;
  readonly javaEmitRecords?: Nullable<boolean>;
}