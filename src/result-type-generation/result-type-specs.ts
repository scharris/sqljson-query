import { deepEquals } from "../util/objects";

export interface ResultTypeSpec extends ResultProperties
{
  readonly queryName: string;
  readonly table: string;
  readonly unwrapped: boolean;
  readonly resultTypeName?: string;
}

export interface ResultProperties
{
  readonly tableFieldProperties: TableFieldProperty[];
  readonly tableExpressionProperties: TableExpressionProperty[];
  readonly parentReferenceProperties: ParentReferenceProperty[];
  readonly childCollectionProperties: ChildCollectionProperty[];
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
  readonly displayOrder?: number;
}

export interface TableExpressionProperty
{
  readonly name: string;
  readonly fieldExpression: string | null;
  readonly specifiedSourceCodeFieldType: string | {[srcLang: string]: string} | null; // As specified in query spec.
  readonly displayOrder?: number;
}

export interface ParentReferenceProperty
{
  readonly name: string;
  readonly refResultType: ResultTypeSpec
  readonly nullable: boolean | null;
  readonly displayOrder?: number;
}

export interface ChildCollectionProperty
{
  readonly name: string;
  readonly elResultType: ResultTypeSpec; // Just the collection element type without the collection type itself.
  readonly nullable: boolean | null; // Nullable when the field is inlined from a parent with a record condition.
  readonly displayOrder?: number;
}

export function propertiesCount(resType: ResultTypeSpec): number
{
  return (
    resType.tableFieldProperties.length +
    resType.tableExpressionProperties.length +
    resType.parentReferenceProperties.length +
    resType.childCollectionProperties.length
  );
}

export function resultTypeSpecsEqual
  (
    rt1: ResultTypeSpec,
    rt2: ResultTypeSpec
  )
  : boolean
{
  return (
    rt1.queryName === rt2.queryName &&
    rt1.table === rt2.table &&
    rt1.resultTypeName === rt2.resultTypeName &&
    deepEquals(rt1.tableFieldProperties, rt2.tableFieldProperties) &&
    deepEquals(rt1.tableExpressionProperties,    rt2.tableExpressionProperties) &&
    deepEquals(rt1.parentReferenceProperties,  rt2.parentReferenceProperties) &&
    deepEquals(rt1.childCollectionProperties,  rt2.childCollectionProperties) &&
    rt1.unwrapped === rt2.unwrapped
  );
}
