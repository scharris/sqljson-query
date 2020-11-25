import {arrayEquals, ownPropsEq} from './util/collections';

export interface ResultType
{
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
      arrayEquals(rt1.simpleTableFieldProperties, rt2.simpleTableFieldProperties, ownPropsEq) &&
      arrayEquals(rt1.tableExpressionProperty, rt2.tableExpressionProperty, ownPropsEq) &&
      arrayEquals(rt1.parentReferenceProperties, rt2.parentReferenceProperties, ownPropsEq) &&
      arrayEquals(rt1.childCollectionProperties, rt2.childCollectionProperties, ownPropsEq) &&
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


export function simpleTableFieldPropertiesEqual(f1: SimpleTableFieldProperty, f2: SimpleTableFieldProperty): boolean
{
   return (
      f1.name === f2.name &&
      f1.databaseType === f2.databaseType &&
      f1.length === f2.length &&
      f1.precision === f2.precision &&
      f1.fractionalDigits === f2.fractionalDigits &&
      f1.nullable === f2.nullable &&
      f1.specifiedSourceCodeFieldType === f2.specifiedSourceCodeFieldType
   );
}

export interface TableExpressionProperty
{
   readonly name: string;
   readonly fieldExpression: string | null;
   readonly specifiedSourceCodeFieldType: string | null; // As specified in query spec.
}

export function tableExpressionPropertiesEqual(f1: TableExpressionProperty, f2: TableExpressionProperty): boolean
{
   return (
      f1.name === f2.name &&
      f1.fieldExpression === f2.fieldExpression &&
      f1.specifiedSourceCodeFieldType === f2.specifiedSourceCodeFieldType
   );
}

export interface ParentReferenceProperty
{
   readonly name: string;
   readonly resultType: ResultType
   readonly nullable: boolean | null;
}

export function parentReferencePropertiesEqual(f1: ParentReferenceProperty, f2: ParentReferenceProperty): boolean
{
   return (
      f1.name === f2.name &&
      f1.nullable === f2.nullable &&
      resultTypesEqual(f1.resultType, f2.resultType)
   );
}

export interface ChildCollectionProperty
{
   readonly name: string;
   readonly resultType: ResultType; // Just the collection element type without the collection type itself.
   readonly nullable: boolean | null; // Nullable when the field is inlined from a parent with a record condition.
}

export function childCollectionPropertiesEqual(f1: ChildCollectionProperty, f2: ChildCollectionProperty): boolean
{
   return (
      f1.name === f2.name &&
      f1.nullable === f2.nullable &&
      resultTypesEqual(f1.resultType, f2.resultType)
   );
}
