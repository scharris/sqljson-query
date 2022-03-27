import { caseNormalizeName, relIdDescn } from './util/mod';
import { DatabaseMetadata, makeRelId, RelId, RelMetadata } from './dbmd';

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
  additionalObjectPropertyColumns?: AdditionalObjectPropertyColumn[];
  generateResultTypes?: boolean;
  generateSource?: boolean;
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
  resultTypeName?: string;
}

export type TableFieldExpr = TableField | TableExpr;

export interface TableField
{
  field: string;
  expression?: null;
  jsonProperty?: string; // Required if value is not a simple field name.
  fieldTypeInGeneratedSource?: string | {[srcLang: string]: string};
  withTableAliasAs?: string; // Table alias escape sequence which may be used in value (default '$$').
  displayOrder?: number;
}

export interface TableExpr
{
  field?: null;
  expression: string;
  jsonProperty: string;
  fieldTypeInGeneratedSource: string | {[srcLang: string]: string};
  withTableAliasAs?: string; // Table alias escape sequence which may be used in value (default '$$').
  displayOrder?: number;
}

export interface ParentSpec extends TableJsonSpec
{
  referenceName?: string | undefined;
  customJoinCondition?: CustomJoinCondition;
  viaForeignKeyFields?: string[];
  alias?: string | undefined;
}

export interface ReferencedParentSpec extends ParentSpec
{
  referenceName: string;
  displayOrder?: number;
}

export interface InlineParentSpec extends ParentSpec
{
  referenceName: undefined;
}

export interface ChildSpec extends TableJsonSpec
{
  collectionName: string;
  foreignKeyFields?: string[];
  customJoinCondition?: CustomJoinCondition;
  filter?: string;
  unwrap?: boolean;
  orderBy?: string;
  displayOrder?: number;
}

export interface CustomJoinCondition
{
  equatedFields: FieldPair[];
  // By default a custom join condition for a parent will cause a nullable parent reference or nullable inline
  // fields from the parent. This option allows asserting that a matching parent record always exists for this
  // join condition, so the parent reference or inline fields can be non-nullable if other factors don't
  // prevent it (such as a parent record condition, or an inlined field being nullable in the parent itself).
  matchAlwaysExists?: boolean;
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

export type AdditionalObjectPropertyColumn = string | { property: string; as: string };


export function getInlineParentSpecs(tableSpec: TableJsonSpec): InlineParentSpec[]
{
  return (tableSpec.parentTables || []).flatMap(ts =>
    ts.referenceName === undefined ? [ts as InlineParentSpec] : []
  );
}

export function getReferencedParentSpecs(tableSpec: TableJsonSpec): ReferencedParentSpec[]
{
  return (tableSpec.parentTables || []).flatMap(ts =>
    ts.referenceName != null ? [ts as ReferencedParentSpec] : []
  );
}

export function getQueryParamNames(querySpec: QuerySpec): string[]
{
  return getParamNames(querySpec.tableJson);
}

function getParamNames(tableJsonSpec: TableJsonSpec): string[]
{
  const paramNames: string[] = [];

  for (const childSpec of tableJsonSpec.childTables || [])
    paramNames.push(...getParamNames(childSpec));

  for (const parentSpec of tableJsonSpec.parentTables || [])
    paramNames.push(...getParamNames(parentSpec));

  if (tableJsonSpec?.recordCondition?.paramNames != undefined)
    paramNames.push(...tableJsonSpec.recordCondition.paramNames);

  return paramNames;
}

export function addLocPart(specLoc: SpecLocation, addPart: string)
{
  return {
    ...specLoc,
    queryPart: !specLoc.queryPart ? addPart: `${specLoc.queryPart} / ${addPart}`
  };
}

export interface SpecLocation
{
  queryName: string;
  queryPart?: string;
}

export class SpecError extends Error
{
  constructor(public specLocation: SpecLocation, public problem: string)
  {
    super(`SpecError in query '${specLocation.queryName}' at ${specLocation.queryPart || 'top level'}: ${problem}`);
  }
}

// Validation functions

export function identifyTable
  (
    table: string, // as from input, possibly qualified
    defaultSchema: string | null,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
  : RelId
{
  return getRelMetadata(table, defaultSchema, dbmd, specLoc).relationId;
}

export function verifyTableFieldExpressionsValid
  (
    tableSpec: TableJsonSpec,
    defaultSchema: string | null,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
{
  if (!tableSpec.fieldExpressions)
    return;

  const simpleSelectFields : string[] = [];
  for ( const [ix, fieldExpr] of tableSpec.fieldExpressions.entries() )
  {
    if (typeof fieldExpr === 'string')
      simpleSelectFields.push(fieldExpr);
    else
    {
      if ( (fieldExpr.field == null) === (fieldExpr.expression == null) )
        throw new SpecError(specLoc, `fieldExpressions entry #${ix+1} is invalid: ` +
          "exactly one of 'field' or 'expression' properties must be provided.");
      if (fieldExpr.expression != null && fieldExpr.fieldTypeInGeneratedSource == null)
        throw new SpecError(specLoc, `fieldExpressions entry #${ix+1} is invalid: ` +
          "field type in generated source must be specified with the 'expression' property.");
      if (fieldExpr.field)
        simpleSelectFields.push(fieldExpr.field);
    }
  }

  const relMd = getRelMetadata(tableSpec.table, defaultSchema, dbmd, specLoc);

  verifyFieldsExistInRelMd(simpleSelectFields, relMd, dbmd, specLoc);
}

export function validateCustomJoinCondition
  (
    customJoinCond: CustomJoinCondition,
    childRelId: RelId,
    parentRelId: RelId,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
{
  const parentMd = dbmd.getRelationMetadata(parentRelId);
  const childMd = dbmd.getRelationMetadata(childRelId);

  if (parentMd == null)
    throw new SpecError({...specLoc, queryPart: "custom join condition"}, "Parent table not found.");
  if (childMd == null)
    throw new SpecError({...specLoc, queryPart: "custom join condition"}, "Child table not found.");

  const parentMatchFields = customJoinCond.equatedFields.map(fieldPair => fieldPair.parentPrimaryKeyField);
  verifyFieldsExistInRelMd(parentMatchFields, parentMd, dbmd, specLoc);

  const childMatchFields = customJoinCond.equatedFields.map(fieldPair => fieldPair.childField);
  verifyFieldsExistInRelMd(childMatchFields, childMd, dbmd, specLoc);
}

function verifyFieldsExistInRelMd
  (
    fieldNames: string[],
    relMd: RelMetadata,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
{
  const mdFields = new Set(relMd.fields.map(f => f.name));

  const missing = fieldNames.filter(fieldName => !mdFields.has(caseNormalizeName(fieldName, dbmd.caseSensitivity)));

  if (missing.length !== 0)
    throw new SpecError(specLoc,
      `Field(s) not found in table ${relIdDescn(relMd.relationId)}: ${missing.join(', ')}.`
    );
}

function getRelMetadata
  (
    table: string, // as from input, possibly qualified
    defaultSchema: string | null,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
  : RelMetadata
{
  const relMd = dbmd.getRelationMetadata(makeRelId(table, defaultSchema, dbmd.caseSensitivity));

  if (relMd == null)
    throw new SpecError(specLoc, `Table '${table}' was not found in database metadata.`);

  return relMd;
}
