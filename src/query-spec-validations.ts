import {DatabaseMetadata, RelId, relIdString, RelMetadata, toRelId} from './database-metadata/database-metadata';
import {CustomJoinCondition, SpecError, SpecLocation, TableJsonSpec} from './query-specs';
import {normalizeName} from './util/database-names';

export function identifyTable
  (
    table: string, // as from input, possibly qualified
    defaultSchema: string | null,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
  : RelId
{
  const relMd = dbmd.getRelationMetadata(toRelId(table, defaultSchema, dbmd.caseSensitivity));

  if ( relMd == null )
    throw new SpecError(specLoc, `Table '${table}' not found in database metadata.`);

  return relMd.relationId;
}

export function verifyTableFieldExpressionsValid
  (
    tableSpec: TableJsonSpec,
    defaultSchema: string | null,
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
 )
{
  if ( !tableSpec.fieldExpressions )
    return;

  const simpleSelectFields : string[] = [];
  for ( const [ix, fieldExpr] of tableSpec.fieldExpressions.entries() )
  {
    if ( typeof fieldExpr === 'string' )
      simpleSelectFields.push(fieldExpr);
    else
    {
      if ( (fieldExpr.field == null) === (fieldExpr.expression == null) )
        throw new SpecError(specLoc, `fieldExpressions entry #${ix+1} is invalid: ` +
          "exactly one of 'field' or 'expression' properties must be provided.");
      if ( fieldExpr.expression != null && fieldExpr.fieldTypeInGeneratedSource == null )
        throw new SpecError(specLoc, `fieldExpressions entry #${ix+1} is invalid: ` +
          "fieldTypeInGeneratedSource must be specified with the 'expression' property.");
      if ( fieldExpr.field )
        simpleSelectFields.push(fieldExpr.field);
    }
  }

  const relMd = dbmd.getRelationMetadata(toRelId(tableSpec.table, defaultSchema, dbmd.caseSensitivity));
  if ( relMd == null )
    throw new SpecError(specLoc, `Table '${tableSpec.table}' was not found in database metadata.`);

  this.verifyRelMdFieldsExist(relMd, simpleSelectFields, dbmd, specLoc);
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

  if ( parentMd == null )
    throw new SpecError({...specLoc, queryPart: "custom join condition"}, "Parent table not found.");
  if ( childMd == null )
    throw new SpecError({...specLoc, queryPart: "custom join condition"}, "Child table not found.");

  const parentMatchFields = customJoinCond.equatedFields.map(fieldPair => fieldPair.parentPrimaryKeyField);
  this.verifyRelMdFieldsExist(parentMd, parentMatchFields, dbmd, specLoc);

  const childMatchFields = customJoinCond.equatedFields.map(fieldPair => fieldPair.childField);
  this.verifyRelMdFieldsExist(childMd, childMatchFields, dbmd, specLoc);
}

export function verifyRelMdFieldsExist
  (
    relMd: RelMetadata,
    fieldNames: string[],
    dbmd: DatabaseMetadata,
    specLoc: SpecLocation
  )
{
  const mdFields = new Set(relMd.fields.map(f => f.name));

  const missing = fieldNames.filter(fieldName => !mdFields.has(normalizeName(fieldName, dbmd.caseSensitivity)));

  if ( missing.length !== 0 )
    throw new SpecError(specLoc,
      `Field(s) not found in table ${relIdString(relMd.relationId)}: ${missing.join(', ')}.`
    );
}
