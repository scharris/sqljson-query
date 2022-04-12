import { ResultTypeSpec, TableFieldResultTypeProperty } from './result-type-generation';
import { Nullable } from './util/mod';

export type SourceLanguage = 'TS' | 'Java';

export type CustomPropertyTypeFn = // TODO: Modify all callers to pass src language as third argument.
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