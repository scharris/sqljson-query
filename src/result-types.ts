import {deepEquals} from './util/objects';

export interface ResultType
{
  readonly queryName: string;
  readonly table: string;
  readonly tableFieldProperties: TableFieldProperty[];
  readonly tableExpressionProperty: TableExpressionProperty[];
  readonly parentReferenceProperties: ParentReferenceProperty[];
  readonly childCollectionProperties: ChildCollectionProperty[];
  readonly unwrapped: boolean;
}

export function propertiesCount(gt: ResultType): number
{
  return (
    gt.tableFieldProperties.length +
    gt.tableExpressionProperty.length +
    gt.parentReferenceProperties.length +
    gt.childCollectionProperties.length
  );
}

export function resultTypesEqual
  (
    rt1: ResultType,
    rt2: ResultType
  )
  : boolean
{
  return (
    rt1.table === rt2.table &&
    deepEquals(rt1.tableFieldProperties, rt2.tableFieldProperties) &&
    deepEquals(rt1.tableExpressionProperty,    rt2.tableExpressionProperty) &&
    deepEquals(rt1.parentReferenceProperties,  rt2.parentReferenceProperties) &&
    deepEquals(rt1.childCollectionProperties,  rt2.childCollectionProperties) &&
    rt1.unwrapped === rt2.unwrapped
  );
}

export interface TableFieldProperty
{
  readonly name: string; // json property name
  readonly databaseFieldName: string;
  readonly databaseType: string;
  readonly length: number | null;
  readonly precision: number | null;
  readonly fractionalDigits: number | null;
  readonly nullable: boolean | null;
  readonly specifiedSourceCodeFieldType: string | {[srcLang: string]: string} | null; // As optionally specified in query spec.
}

export interface TableExpressionProperty
{
  readonly name: string;
  readonly fieldExpression: string | null;
  readonly specifiedSourceCodeFieldType: string | {[srcLang: string]: string} | null; // As specified in query spec.
}

export interface ParentReferenceProperty
{
  readonly name: string;
  readonly refResultType: ResultType
  readonly nullable: boolean | null;
}

export interface ChildCollectionProperty
{
  readonly name: string;
  readonly elResultType: ResultType; // Just the collection element type without the collection type itself.
  readonly nullable: boolean | null; // Nullable when the field is inlined from a parent with a record condition.
}
