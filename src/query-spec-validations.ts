import {caseNormalizeName} from './util/database-names';
import {DatabaseMetadata, RelId, relIdString, RelMetadata, toRelId} from './database-metadata';
import {CustomJoinCondition, SpecError, SpecLocation, TableJsonSpec} from './query-specs';

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
    throw new SpecError(specLoc, `Table '${table}' was not found in database metadata.`);

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
          "field type in generated source must be specified with the 'expression' property.");
      if ( fieldExpr.field )
        simpleSelectFields.push(fieldExpr.field);
    }
  }

  const relMd = dbmd.getRelationMetadata(toRelId(tableSpec.table, defaultSchema, dbmd.caseSensitivity));
  if ( relMd == null )
    throw new SpecError(specLoc, `Table '${tableSpec.table}' was not found in database metadata.`);

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

  if ( parentMd == null )
    throw new SpecError({...specLoc, queryPart: "custom join condition"}, "Parent table not found.");
  if ( childMd == null )
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

  if ( missing.length !== 0 )
    throw new SpecError(specLoc,
      `Field(s) not found in table ${relIdString(relMd.relationId)}: ${missing.join(', ')}.`
    );
}
