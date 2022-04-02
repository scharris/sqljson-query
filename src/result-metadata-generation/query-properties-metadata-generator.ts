import {
  getBaseTable, getPropertySelectEntries, QueryFromEntry, SelectEntry, SqlSpec
} from "../sql-generation/sql-specs";
import { ParentStep, QueryPropertyMetadata, QueryPropertiesMetadata } from "./query-properties-metadata";

export function makeQueryPropertiesMetadata
  (
    queryName: string,
    sqlSpec: SqlSpec
  )
  : QueryPropertiesMetadata
{
  return {
    queryName,
    table: getBaseTable(sqlSpec),
    properties: makePropertyMetadatas(sqlSpec)
  };
}

function makePropertyMetadatas
  (
    sqlSpec: SqlSpec
  )
  : QueryPropertyMetadata[]
{
  return getPropertySelectEntries(sqlSpec).map(se => makePropertyMetadata(se, sqlSpec));
}

function makePropertyMetadata
  (
    selectEntry: SelectEntry,
    sqlSpec: SqlSpec
  )
  : QueryPropertyMetadata
{
  switch (selectEntry.entryType)
  {
    case 'se-field':
      return {
        type: 'qpm-field',
        propertyName: selectEntry.projectedName,
        sourceField: selectEntry.field.name,
      };
    case 'se-expr':
      return {
        type: 'qpm-expr',
        propertyName: selectEntry.projectedName,
        sourceExpression: selectEntry.expression,
      };
    case 'se-parent-ref':
    {
      const parentSql = selectEntry.parentRowObjectSql;
      return {
        type: 'qpm-parent-ref',
        referencePropertyName: selectEntry.projectedName,
        table: getBaseTable(parentSql),
        properties: makePropertyMetadatas(parentSql)
      };
    }
    case 'se-child-coll':
    {
      const childSql = selectEntry.collectionSql;
      return {
        type: 'qpm-child-coll',
        collectionPropertyName: selectEntry.projectedName,
        table: getBaseTable(childSql),
        properties: makePropertyMetadatas(childSql),
        unwrapped: !(childSql.objectWrapProperties ?? true)
      };
    }
    case 'se-inline-parent-prop':
    {
      const { ancestorPropertyMetadata, parentSteps } =
        resolveInlineParentProperty(
          sqlSpec,
          selectEntry.projectedName,
          selectEntry.parentAlias
        );
      return { ...ancestorPropertyMetadata, inlinedFromAncestorVia: parentSteps };
    }
    default:
      throw new Error(`Unexpected select entry type '${selectEntry.entryType}'.`);
  }
}

// Resolve an inline parent property to a base property type (non-inline-parent property), by
// recursively de-referencing inline parent links.
function resolveInlineParentProperty
  (
    sqlSpec: SqlSpec,
    propertyName: string,
    fromInlineParentAlias: string
  )
  : { ancestorPropertyMetadata: QueryPropertyMetadata; parentSteps: ParentStep[] }
{
  const parentFromEntry = sqlSpec.fromEntries.find(fe => fe.alias === fromInlineParentAlias);

  if (!parentFromEntry)
    throw new Error(`Base table for alias ${fromInlineParentAlias} was not found in sql spec: ${sqlSpec}.`);
  if (parentFromEntry.entryType !== 'query')
    throw new Error(`Expected inline parent's FROM clause entry to be a query not a table.`);

  const parentSql = parentFromEntry.query;
  const parentSelectEntry = parentSql.selectEntries.find(se => se.projectedName === propertyName);
  const parentStep = makeParentStep(parentFromEntry);

  if (!parentSelectEntry)
    throw new Error(`Parent select entry not found for property '${propertyName}'`);

  if (parentSelectEntry.entryType !== 'se-inline-parent-prop')
    return {
      ancestorPropertyMetadata: makePropertyMetadata(parentSelectEntry, parentSql),
      parentSteps: [ parentStep ]
    };
  else // parent property is itself an inline-parent property: resolve again
  {
    const propResolvedFromParent =
      resolveInlineParentProperty(
        parentSql,
        parentSelectEntry.parentAlias,
        parentSelectEntry.projectedName
      );

    return {
      ...propResolvedFromParent,
      parentSteps: [ parentStep, ...propResolvedFromParent.parentSteps ]
    };
  }
}

function makeParentStep(parentFromEntry: QueryFromEntry): ParentStep
{
  if (!parentFromEntry.join)
    throw new Error(`Expected join clause for inline parent.`);

  const parent = getBaseTable(parentFromEntry.query);
  const viaFkFields =
    parentFromEntry
    .join
    .parentChildCondition
    .matchedFields
    .map(fp => fp.foreignKeyFieldName);

  return { parent, fkFields: viaFkFields };
}