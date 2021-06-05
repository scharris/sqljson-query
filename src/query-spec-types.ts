export interface QueryGroupSpec
{
  defaultSchema?: string;
  propertyNameDefault?: PropertyNameDefault;
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
  propertyNameDefault?: PropertyNameDefault;
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
  fieldTypeInGeneratedSource?: string | {[srcLang: string]: string};
  withTableAliasAs?: string; // Table alias escape sequence which may be used in value (default '$$').
}

export interface ParentSpec
{
  referenceName?: string | undefined;
  customJoinCondition?: CustomJoinCondition;
  tableJson: TableJsonSpec;
  viaForeignKeyFields?: string[];
  alias?: string | undefined;
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

export type PropertyNameDefault = "AS_IN_DB" | "CAMELCASE";

export type ResultRepr = "MULTI_COLUMN_ROWS" | "JSON_OBJECT_ROWS" | "JSON_ARRAY_ROW";
