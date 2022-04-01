import { RelId } from "../dbmd";
import { ChildCollectionSelectEntry, ExpressionSelectEntry, FieldSelectEntry, getBaseTable, getPropertySelectEntries, InlineParentSelectEntry, ParentReferenceSelectEntry, QueryFromEntry, SelectEntry, SqlSpec } from "../sql-generation/sql-specs";
import { ResultTypeProperty, ResultTypeSpec } from "./result-type-specs";

export function makeResultTypeSpecs
  (
    sqlSpec: SqlSpec
  )
  : ResultTypeSpec[]
{
  const resultTypeProperties =
    getPropertySelectEntries(sqlSpec).map(se =>
      makeResultTypeProperty(se, sqlSpec)
    );

  const topType = {
    table: getBaseTable(sqlSpec),
    properties: resultTypeProperties.map(rtp => rtp.resultTypeProperty),
    unwrapped: !(sqlSpec.objectWrapProperties ?? true),
    resultTypeName: sqlSpec.resultTypeName,
  };

  return [
    topType,
    ...resultTypeProperties.flatMap(rtp => rtp.contributedResultTypes)
  ];
}

function makeResultTypeProperty
  (
    selectEntry: SelectEntry,
    sqlSpec: SqlSpec
  )
  : { resultTypeProperty: ResultTypeProperty, contributedResultTypes: ResultTypeSpec[] }
{
  switch (selectEntry.entryType)
  {
    case 'se-field':
      return getTableFieldResultTypeProperty(selectEntry);
    case 'se-expr':
      return getTableExpressionResultTypeProperty(selectEntry);
    case 'se-parent-ref':
      return getParentRefResultTypeProperty(selectEntry, sqlSpec);
    case 'se-child-coll':
      return getChildCollectionResultTypeProperty(selectEntry, sqlSpec);
    case 'se-inline-parent-prop':
      return resolveInlineParentResultTypeProperty(selectEntry, sqlSpec);
    default:
      throw new Error(`Unexpected select entry type '${selectEntry.entryType}'.`);
  }
}

function getTableFieldResultTypeProperty
  (
    selectEntry: FieldSelectEntry
  )
  : { resultTypeProperty: ResultTypeProperty; contributedResultTypes: ResultTypeSpec[]; }
{
  return {
    resultTypeProperty: {
      type: 'rtp-field',
      propertyName: selectEntry.projectedName,
      databaseFieldName: selectEntry.field.name,
      databaseType: selectEntry.field.databaseType,
      length: selectEntry.field.length,
      precision: selectEntry.field.precision,
      fractionalDigits: selectEntry.field.fractionalDigits,
      nullable: selectEntry.field.nullable,
      specifiedSourceCodeFieldType: selectEntry.sourceCodeFieldType,
    },
    contributedResultTypes: []
  };
}

function getTableExpressionResultTypeProperty
  (
    selectEntry: ExpressionSelectEntry
  )
  : { resultTypeProperty: ResultTypeProperty; contributedResultTypes: ResultTypeSpec[]; }
{
  return {
    resultTypeProperty: {
      type: 'rtp-expr',
      propertyName: selectEntry.projectedName,
      fieldExpression: selectEntry.expression,
      specifiedSourceCodeFieldType: selectEntry.sourceCodeFieldType,
    },
    contributedResultTypes: []
  };
}

function getParentRefResultTypeProperty
  (
    selectEntry: ParentReferenceSelectEntry,
    sqlSpec: SqlSpec
  )
  : { resultTypeProperty: ResultTypeProperty, contributedResultTypes: ResultTypeSpec[] }
{
  const parentResultTypes = makeResultTypeSpecs(selectEntry.parentRowObjectSql);
  return {
    resultTypeProperty: {
      type: 'rtp-parent-ref',
      propertyName: selectEntry.projectedName,
      refResultType: parentResultTypes[0],
      nullable: true, // TODO
    },
    contributedResultTypes: parentResultTypes
  };
}

function getChildCollectionResultTypeProperty
  (
    selectEntry: ChildCollectionSelectEntry,
    sqlSpec: SqlSpec
  )
  : { resultTypeProperty: ResultTypeProperty, contributedResultTypes: ResultTypeSpec[] }
{
  const childResultTypes = makeResultTypeSpecs(selectEntry.collectionSql);
  return {
    resultTypeProperty: {
      type: 'rtp-child-coll',
      propertyName: selectEntry.projectedName,
      elResultType: childResultTypes[0],
      nullable: true, // TODO
    },
    contributedResultTypes: childResultTypes
  };
}

// Resolve an inline parent property to a base property type (non-inline-parent property), by
// recursively de-referencing inline parent links.
function resolveInlineParentResultTypeProperty
  (
    selectEntry: InlineParentSelectEntry,
    sqlSpec: SqlSpec,
  )
  : { resultTypeProperty: ResultTypeProperty;
      contributedResultTypes: ResultTypeSpec[];
      parentSteps: ParentStep[] }
{
  const propertyName = selectEntry.projectedName;
  const parentFromEntry = sqlSpec.fromEntries.find(fe => fe.alias === selectEntry.parentAlias);
  if (!parentFromEntry || parentFromEntry.entryType !== 'query')
    throw new Error(`Query FROM entry not found for inline parent property ${propertyName}.`);

  const parentStep = makeParentStep(parentFromEntry);
  const parentSelectEntry = parentFromEntry.query.selectEntries.find(se => se.projectedName === propertyName);
  if (!parentSelectEntry) throw new Error(`Parent select entry not found for property '${propertyName}'`);

  if (parentSelectEntry.entryType !== 'se-inline-parent-prop')
    return {
      ...makeResultTypeProperty(parentSelectEntry, parentFromEntry.query),
      parentSteps: [ parentStep ]
    };
  else // parent property is itself an inline-parent property: continue resolving
  {
    const propResolvedFromParent =
      resolveInlineParentResultTypeProperty(parentSelectEntry, parentFromEntry.query);

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

  const parent = getBaseTable(parentFromEntry.query);
  const viaFkFields =
    parentFromEntry
    .joinCondition
    .parentChildCondition
    .matchedFields
    .map(fp => fp.foreignKeyFieldName);

  return { parent, fkFields: viaFkFields };
}

export type ParentStep = { parent: RelId, fkFields: string[] };