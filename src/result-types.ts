import * as _ from 'lodash';

export interface ResultType
{
  readonly queryName: string;
  readonly table: string;
  readonly typeName: string; // always unqualified by module/package
  readonly simpleTableFieldProperties: SimpleTableFieldProperty[];
  readonly tableExpressionProperty: TableExpressionProperty[];
  readonly parentReferenceProperties: ParentReferenceProperty[];
  readonly childCollectionProperties: ChildCollectionProperty[];
  readonly unwrapped: boolean;
}

export function fieldsCount(gt: ResultType): number
{
  return (
    gt.simpleTableFieldProperties.length +
    gt.tableExpressionProperty.length +
    gt.parentReferenceProperties.length +
    gt.childCollectionProperties.length
  );
}

export function resultTypesEqual
  (
    rt1: ResultType,
    rt2: ResultType,
    ignoreName: boolean = false
  )
  : boolean
{
  return (
    (ignoreName || rt1.typeName === rt2.typeName) &&
    rt1.table === rt2.table &&
    _.isEqual(rt1.simpleTableFieldProperties, rt2.simpleTableFieldProperties) &&
    _.isEqual(rt1.tableExpressionProperty,    rt2.tableExpressionProperty) &&
    _.isEqual(rt1.parentReferenceProperties,  rt2.parentReferenceProperties) &&
    _.isEqual(rt1.childCollectionProperties,  rt2.childCollectionProperties) &&
    rt1.unwrapped === rt2.unwrapped
  );
}

export interface SimpleTableFieldProperty
{
  readonly name: string;
  readonly databaseType: string;
  readonly length: number | null;
  readonly precision: number | null;
  readonly fractionalDigits: number | null;
  readonly nullable: boolean | null;
  readonly specifiedSourceCodeFieldType: string | null; // As optionally specified in query spec.
}

export interface TableExpressionProperty
{
  readonly name: string;
  readonly fieldExpression: string | null;
  readonly specifiedSourceCodeFieldType: string | null; // As specified in query spec.
}

export interface ParentReferenceProperty
{
  readonly name: string;
  readonly resultType: ResultType
  readonly nullable: boolean | null;
}

export interface ChildCollectionProperty
{
  readonly name: string;
  readonly resultType: ResultType; // Just the collection element type without the collection type itself.
  readonly nullable: boolean | null; // Nullable when the field is inlined from a parent with a record condition.
}
