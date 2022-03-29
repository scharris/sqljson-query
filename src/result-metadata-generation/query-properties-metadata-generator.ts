import { RelId } from "../dbmd";
import { getPropertySelectEntries, QueryFromEntry, SelectEntry, SqlSpec } from "../sql-generation/sql-specs";
import { ParentStep, PropertyMetadata, QueryPropertiesMetadata } from "./query-properties-metadata";

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
  : PropertyMetadata[]
{
  return getPropertySelectEntries(sqlSpec).map(se => makePropertyMetadata(se, sqlSpec));
}

function makePropertyMetadata
  (
    selectEntry: SelectEntry,
    sqlSpec: SqlSpec
  )
  : PropertyMetadata
{
  switch (selectEntry.entryType)
  {
    case 'field':
      return {
        type: 'field',
        propertyName: selectEntry.projectedName,
        field: selectEntry.fieldName,
      };
    case 'expr':
      return {
        type: 'expr',
        propertyName: selectEntry.projectedName,
        expression: selectEntry.expression,
      };
    case 'parent-ref':
    {
      const parentSql = selectEntry.parentRowObjectSql;
      return {
        type: 'parent-ref',
        propertyName: selectEntry.projectedName,
        table: getBaseTable(parentSql),
        properties: makePropertyMetadatas(parentSql)
      };
    }
    case 'child-coll':
    {
      const childSql = selectEntry.collectionSql;
      return {
        type: 'child-coll',
        propertyName: selectEntry.projectedName,
        table: getBaseTable(childSql),
        properties: makePropertyMetadatas(childSql),
        unwrapped: !(childSql.objectWrapProperties ?? true)
      };
    }
    case 'inline-parent-prop':
    {
      const { ancestorPropertyMetadata, parentSteps } =
        resolveInlinedParentProperty(
          sqlSpec,
          selectEntry.parentAlias,
          selectEntry.parentSelectEntry.projectedName
        );
      return { ...ancestorPropertyMetadata, viaInlinedParentSteps: parentSteps };
    }
    default:
      throw new Error(`Unexpected select entry type '${selectEntry.entryType}'.`);
  }
}

// Resolve an inline parent property to a base property type (non-inline-parent property), by
// recursively de-referencing inline parent links.
function resolveInlinedParentProperty
  (
    sqlSpec: SqlSpec,
    alias: string,
    parentPropertyName: string
  )
  : { ancestorPropertyMetadata: PropertyMetadata; parentSteps: ParentStep[] }
{
  const parentFromEntry = sqlSpec.fromEntries.find(fe => fe.alias === alias);

  if (!parentFromEntry)
    throw new Error(`Base table for alias ${alias} was not found in sql spec: ${sqlSpec}.`);
  if (parentFromEntry.entryType !== 'query')
    throw new Error(`Expected inline parent's FROM clause entry to be a query not a table.`);

  const parentSql = parentFromEntry.query;
  const parentSelectEntry = parentSql.selectEntries.find(se => se.projectedName === parentPropertyName);
  const parentStep = makeParentStep(parentFromEntry);

  if (!parentSelectEntry)
    throw new Error(`Parent select entry not found for property '${parentPropertyName}'`);

  if (parentSelectEntry.entryType !== 'inline-parent-prop')
    return {
      ancestorPropertyMetadata: makePropertyMetadata(parentSelectEntry, parentSql),
      parentSteps: [ parentStep ]
    };
  else // parent property is itself an inline-parent property: resolve again
  {
    const propResolvedFromParent =
      resolveInlinedParentProperty(
        parentSql,
        parentSelectEntry.parentAlias,
        parentSelectEntry.parentSelectEntry.projectedName
      );

    return {
      ...propResolvedFromParent,
      parentSteps: [ parentStep, ...propResolvedFromParent.parentSteps ]
    };
  }
}

function makeParentStep(parentFromEntry: QueryFromEntry): ParentStep
{
  if (!parentFromEntry.joinCondition)
    throw new Error(`Expected join condition for inline parent.`);

  return {
    parent: getBaseTable(parentFromEntry.query),
    viaFkFields: parentFromEntry.joinCondition.parentChildCondition.matchedFields.map(fp => fp.foreignKeyFieldName)
  };
}

// Return the leading from clause entry or throw error.
function getBaseTable(sql: SqlSpec): RelId
{
  if (sql.fromEntries[0]?.entryType === 'table')return sql.fromEntries[0].table;
  else throw new Error(`No base table for sql: ${sql}`);
}
