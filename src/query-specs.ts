import * as _ from 'lodash';

export interface QueryGroupSpec
{
  defaultSchema?: string;
  outputFieldNameDefault?: PropertyNameDefault;
  generateUnqualifiedNamesForSchemas: string[];
  querySpecs: QuerySpec[];
}

export interface QuerySpec
{
  queryName: string;
  tableJson: TableJsonSpec;
  resultRepresentations?: ResultRepr[];
  generateResultTypes?: boolean;
  generateSource?: boolean;
  outputFieldNameDefault?: PropertyNameDefault;
  orderBy?: string;
  forUpdate?: boolean;
  typesFileHeader?: string;
}

export interface TableJsonSpec
{
  table: string;
  fieldExpressions?: (string | TableFieldExpr)[];
  parentTables?: ParentSpec[];
  childTables?: ChildSpec[];
  recordCondition?: RecordCondition;
}

export interface TableFieldExpr
{
  field?: string;
  expression?: string;
  jsonProperty?: string; // Required if value is not a simple field name.
  fieldTypeInGeneratedSource?: string;
  withTableAliasAs?: string; // Table alias escape sequence which may be used in value (default '$$').
}

export interface ParentSpec
{
  referenceName?: string;
  customJoinCondition?: CustomJoinCondition;
  tableJson: TableJsonSpec;
  viaForeignKeyFields?: string[];
}

export interface ReferencedParentSpec extends ParentSpec
{
  referenceName: string;
}

export interface InlineParentSpec extends ParentSpec
{
  referenceName: undefined;
}

export interface ChildSpec
{
  collectionName: string;
  tableJson: TableJsonSpec;
  foreignKeyFields?: string[];
  customJoinCondition?: CustomJoinCondition;
  filter?: string;
  unwrap?: boolean;
  orderBy?: string;
}

export interface CustomJoinCondition
{
  equatedFields: FieldPair[];
}

export interface FieldPair
{
  childField: string;
  parentPrimaryKeyField: string;
}

export interface RecordCondition
{
  sql: string;
  paramNames?: string[];
  withTableAliasAs?: string;
}

export interface SpecLocation
{
  queryName: string;
  queryPart?: string;
}

export function addLocPart(specLoc: SpecLocation, addPart: string)
{
  return {
    ...specLoc,
    queryPart: !specLoc.queryPart ? addPart: `${specLoc.queryPart} / ${addPart}`
  };
}

export class SpecError extends Error
{
  constructor(public specLocation: SpecLocation, public problem: string)
  {
    super(`SpecError in query '${specLocation.queryName}' at '${specLocation.queryPart}': ${problem}`);
  }
}

export type PropertyNameDefault = "AS_IN_DB" | "CAMELCASE";

export type ResultRepr = "MULTI_COLUMN_ROWS" | "JSON_OBJECT_ROWS" | "JSON_ARRAY_ROW";


export function getInlineParentSpecs(tableSpec: TableJsonSpec): InlineParentSpec[]
{
  return _.flatMap(
    tableSpec.parentTables || [],
    ts => ts.referenceName === undefined ? [ts as InlineParentSpec] : []
  );
}

export function getReferencedParentSpecs(tableSpec: TableJsonSpec): ReferencedParentSpec[]
{
  return _.flatMap(
    tableSpec.parentTables || [],
    ts => ts.referenceName != null ? [ts as ReferencedParentSpec] : []
  );
}
