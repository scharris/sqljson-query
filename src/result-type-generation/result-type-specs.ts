import { RelId } from "../dbmd";
import { Nullable } from "../util/mod";
import { deepEquals } from "../util/objects";

export interface ResultTypeSpec
{
  readonly table: RelId;
  readonly properties: ResultTypeProperty[];
  readonly unwrapped: boolean;
  readonly resultTypeName?: Nullable<string>;
}

export type ResultTypeProperty =
  TableFieldResultTypeProperty |
  TableExpressionResultTypeProperty |
  ParentReferenceResultTypeProperty |
  ChildCollectionResultTypeProperty;

export interface TableFieldResultTypeProperty
{
  readonly type: 'rtp-field';
  readonly propertyName: string;
  readonly databaseFieldName: string;
  readonly databaseType: string;
  readonly length: Nullable<number>;
  readonly precision: Nullable<number>;
  readonly fractionalDigits: Nullable<number>;
  readonly nullable: Nullable<boolean>;
  readonly specifiedSourceCodeFieldType: Nullable<string | { [srcLang: string]: string }>;
}

export interface TableExpressionResultTypeProperty
{
  readonly type: 'rtp-expr';
  readonly propertyName: string;
  readonly fieldExpression: Nullable<string>;
  readonly specifiedSourceCodeFieldType: Nullable<string | { [srcLang: string]: string }>;
}

export interface ParentReferenceResultTypeProperty
{
  readonly type: 'rtp-parent-ref';
  readonly propertyName: string;
  readonly refResultType: ResultTypeSpec
  readonly nullable: Nullable<boolean>;
}

export interface ChildCollectionResultTypeProperty
{
  readonly type: 'rtp-child-coll';
  readonly propertyName: string;
  readonly elResultType: ResultTypeSpec; // Just the collection element type without the collection type itself.
  readonly nullable: Nullable<boolean>; // Nullable when the field is inlined from a parent with a record condition.
}

export function resultTypeSpecsEqual
  (
    rt1: ResultTypeSpec,
    rt2: ResultTypeSpec
  )
  : boolean
{
  return (
    rt1.table === rt2.table &&
    rt1.resultTypeName === rt2.resultTypeName &&
    rt1.unwrapped === rt2.unwrapped &&
    deepEquals(rt1.properties, rt2.properties)
  );
}