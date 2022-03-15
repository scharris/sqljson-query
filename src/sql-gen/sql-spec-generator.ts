import { exactUnquotedName, makeMap, makeNameNotInSet } from '../util/mod';
import { DatabaseMetadata, ForeignKey, RelId } from '../dbmd';
import {
  QuerySpec, TableJsonSpec, ResultRepr, SpecLocation, addLocPart, SpecError, TableFieldExpr,
  ChildSpec, CustomJoinCondition, ParentSpec, ReferencedParentSpec, getInlineParentSpecs,
  getReferencedParentSpecs, identifyTable, validateCustomJoinCondition,
  verifyTableFieldExpressionsValid
} from '../query-specs';
import {
  SqlSpec, SqlParts, SelectEntry, ChildCollectionSelectEntry, ChildForeignKeyCondition,
  ParentPrimaryKeyCondition, HiddenPrimaryKeySelectEntry, getPropertySelectEntries
} from './sql-specs';

export class SqlSpecGenerator
{
  constructor
    (
      private readonly dbmd: DatabaseMetadata,
      private readonly defaultSchema: string | null,
      private readonly propertyNameFn: (fieldName: string) => string,
    )
  {}

  public generateSqlSpecs(querySpec: QuerySpec): Map<ResultRepr,SqlSpec>
  {
    const resReps = querySpec.resultRepresentations ?? ['JSON_OBJECT_ROWS'];

    return makeMap(resReps, rep => rep, rep => this.makeSqlSpec(querySpec, rep));
  }

  /// Make SQL for the given query spec and result representation.
  private makeSqlSpec
    (
      query: QuerySpec,
      resultRepr: ResultRepr,
    )
    : SqlSpec
  {
    if (query.forUpdate && resultRepr !== 'MULTI_COLUMN_ROWS')
      throw specError(query, 'for update clause', 'FOR UPDATE only allowed with MULTI_COLUMN_ROWS');

    const specLoc = { queryName: query.queryName };

    switch ( resultRepr )
    {
      case 'MULTI_COLUMN_ROWS':
        const baseSql = this.baseSql(query.tableJson, null, query.orderBy, specLoc);
        return query.forUpdate ? { ...baseSql, forUpdate: true }: baseSql;
      case 'JSON_OBJECT_ROWS':
        const additionalCols = query.additionalObjectPropertyColumns ?? [];
        return this.jsonObjectRowsSql(query.tableJson, additionalCols, null, query.orderBy, specLoc);
      case 'JSON_ARRAY_ROW':
        return this.jsonArrayRowSql(query.tableJson, null, false, query.orderBy, specLoc);
      default:
        throw specError(query, 'resultRepresentations', 'Result representation is not valid.');
    }
  }

  private baseSql
    (
      tj: TableJsonSpec,
      parentChildCond: ParentPrimaryKeyCondition | ChildForeignKeyCondition | null,
      orderBy: string | null | undefined,
      specLoc: SpecLocation,
      exportPkFieldsHidden?: 'export-pk-fields-hidden',
    )
    : SqlSpec
  {
    const sqlb = new SqlParts();

    const relId = identifyTable(tj.table, this.defaultSchema, this.dbmd, specLoc);

    const alias = sqlb.createAliasFor(relId.name);

    sqlb.addFromEntry({ entryType: 'table', table: { ...relId }, alias });

    // If we have a condition from a related table, register the other table's alias to avoid shadowing it.
    if (parentChildCond)
      sqlb.addAlias(parentChildCond.condType === 'fk' ? parentChildCond.parentAlias : parentChildCond.childAlias);

    if (exportPkFieldsHidden)
      sqlb.addSelectEntries(this.hiddenPrimaryKeySelectEntries(relId, alias));

    sqlb.addSelectEntries(this.tableFieldExpressionSelectEntries(tj, alias, specLoc));

    sqlb.addParts(this.inlineParentsSqlParts(tj, relId, alias, sqlb.getAliases(), specLoc));

    sqlb.addParts(this.referencedParentsSqlParts(tj, relId, alias, specLoc));

    sqlb.addSelectEntries(this.childCollectionSelectEntries(tj, relId, alias, specLoc));

    if (parentChildCond)
      sqlb.addWhereEntry({...parentChildCond, fromAlias: alias });

    if (tj.recordCondition)
      sqlb.addWhereEntry({
        condType: 'gen',
        condSql: tj.recordCondition.sql,
        tableAliasPlaceholderInCondSql: tj.recordCondition.withTableAliasAs,
        tableAlias: alias
      });

    if (orderBy != null)
      sqlb.setOrderBy({ orderBy, tableAlias: alias });

    const sqlSpec = sqlb.toSqlSpec();

    if (sqlSpec.selectEntries.length === 0)
      throw new SpecError(specLoc, 'At least one select entry must be specified.');

    return sqlSpec;
  }

  /// Make query SQL having JSON object result values at the top level of the
  /// result set. The query returns a JSON value in a single column and with
  /// any number of result rows.
  private jsonObjectRowsSql
    (
      tj: TableJsonSpec,
      additionalObjectPropertyColumns: string[],
      pkCond: ParentPrimaryKeyCondition | null,
      orderBy: string | null | undefined,
      specLoc: SpecLocation
    )
    : SqlSpec
  {
    return {
      ...this.baseSql(tj, pkCond, orderBy, specLoc),
      objectWrapProperties: true,
      additionalObjectPropertyColumns
    };
  }

  /// Make query SQL having a single row and column result, with the result value
  /// representing the collection of json object representations of all rows of
  /// the table whose output specification is passed.
  private jsonArrayRowSql
    (
      tj: TableJsonSpec,
      childFkCond: ChildForeignKeyCondition | null,
      unwrap: boolean,
      orderBy: string | null | undefined,
      specLoc: SpecLocation
    )
    : SqlSpec
  {
    const baseSql = this.baseSql(tj, childFkCond, orderBy, specLoc);

    if (unwrap && getPropertySelectEntries(baseSql).length != 1)
      throw new SpecError(specLoc, 'Unwrapped child collections cannot have multiple field expressions.');

    return {
      ...baseSql,
      aggregateToArray: true,
      objectWrapProperties: !unwrap,
      fromEntriesLeadingComment: `base query for table '${tj.table}'`,
    };
  }

  private hiddenPrimaryKeySelectEntries
    (
      relId: RelId,
      tableAlias: string
    )
    : HiddenPrimaryKeySelectEntry[]
  {
    return this.dbmd.getPrimaryKeyFieldNames(relId).map(pkField => ({
      entryType: 'hidden-pkf',
      pkFieldName: pkField,
      projectedName: HIDDEN_PK_PREFIX + pkField,
      tableAlias
    }));
  }

  private tableFieldExpressionSelectEntries
    (
      tj: TableJsonSpec,
      tableAlias: string,
      specLoc: SpecLocation
    )
    : SelectEntry[]
  {
    verifyTableFieldExpressionsValid(tj, this.defaultSchema, this.dbmd, specLoc);

    if (!tj.fieldExpressions)
      return [];

    return tj.fieldExpressions.map((tfe, ix) => {
      const feLoc = addLocPart(specLoc, `fieldExpressions entry #${ix+1} of table ${tj.table}`);
      const projectedName = this.jsonPropertyName(tfe, feLoc);

      if (typeof tfe === 'string')
        return { entryType: 'field', projectedName, fieldName: this.quotable(tfe), tableAlias };
      else if (tfe.field)
        return { entryType: 'field', projectedName, fieldName: this.quotable(tfe.field), tableAlias };
      else // general expression
      {
        if (!tfe.expression)
          throw new SpecError(feLoc, `'field' or 'expression' must be provided`);
        return {
          entryType: 'expr',
          projectedName,
          expression: tfe.expression,
          tableAliasPlaceholderInExpr: tfe.withTableAliasAs,
          tableAlias
        };
      }
    });
  }

  private inlineParentsSqlParts
    (
      tj: TableJsonSpec,
      relId: RelId,
      alias: string,
      aliasesInScope: Set<string>,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts(aliasesInScope);

    for (const parent of getInlineParentSpecs(tj))
    {
      const ipLoc = addLocPart(specLoc, `parent table '${parent.table}'`);

      sqlParts.addParts(this.inlineParentSqlParts(parent, relId, alias, sqlParts.getAliases(), ipLoc));
    }

    return sqlParts;
  }

  // Return sql parts for the *including* (child) table's SQL query which are contributed by the inline parent table.
  private inlineParentSqlParts
    (
      parent: ParentSpec,
      childRelId: RelId,
      childAlias: string,
      avoidAliases: Set<string>,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts();

    const parentAlias = parent.alias || makeNameNotInSet('q', avoidAliases);
    sqlParts.addAlias(parentAlias);

    const parentPropsSql = this.baseSql(parent, null, null, specLoc, 'export-pk-fields-hidden');
    // The parent subquery exports "hidden" ('_'-prefixed) primary keys to support the join "ON"
    // condition in its FROM clause entry in the including (child) query. Prefixing is used here
    // to avoid possible name collisions with existing parent properties.
    const matchedFields =
      this.getParentPrimaryKeyCondition(parent, childRelId, childAlias, specLoc)
      .matchedFields
      .map(fp => ({ ...fp, primaryKeyFieldName: HIDDEN_PK_PREFIX + fp.primaryKeyFieldName }));

    sqlParts.addFromEntry({
      entryType: 'query',
      query: parentPropsSql,
      alias: parentAlias,
      joinCondition: {
        joinType: 'LEFT',
        parentChildCondition: { condType: 'fk', fromAlias: childAlias, parentAlias, matchedFields }
      },
      comment: `parent table '${parent.table}', joined for inlined fields`
    });

    for (const [ix, parentPropertySelectEntry] of getPropertySelectEntries(parentPropsSql).entries())
    {
      sqlParts.addSelectEntry({
        entryType: 'inline-parent-prop',
        projectedName: parentPropertySelectEntry.projectedName,
        parentAlias: parentAlias,
        comment: ix === 0 ? `field(s) inlined from parent table '${parent.table}'` : null,
        parentSelectEntry: parentPropertySelectEntry
      });
    }

    return sqlParts;
  }

  private getParentPrimaryKeyCondition
    (
      parentSpec: ParentSpec,
      childRelId: RelId,
      childAlias: string,
      specLoc: SpecLocation
    )
    : ParentPrimaryKeyCondition
  {
    const customJoin = parentSpec.customJoinCondition;

    if (customJoin)
    {
      if (parentSpec.viaForeignKeyFields != undefined)
        throw new SpecError(specLoc, 'Parent with customJoinCondition cannot specify foreignKeyFields.');

      const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, specLoc);

      validateCustomJoinCondition(customJoin, childRelId, parentRelId, this.dbmd, addLocPart(specLoc, 'custom join'));

      return { condType: 'pk', childAlias, matchedFields: this.getMatchedFields(customJoin) };
    }
    else
    {
      const childForeignKeyFieldsSet = parentSpec.viaForeignKeyFields && new Set(parentSpec.viaForeignKeyFields);
      const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, specLoc);
      const fk = this.getForeignKey(childRelId, parentRelId, childForeignKeyFieldsSet, specLoc);

      return { condType: 'pk', childAlias, matchedFields: fk.foreignKeyComponents };
    }
  }

  private referencedParentsSqlParts
    (
      tj: TableJsonSpec,
      relId: RelId,
      alias: string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts();

    for (const parentSpec of getReferencedParentSpecs(tj))
    {
      if ( parentSpec.hasOwnProperty('alias') )
        throw new SpecError(specLoc, 'Refrenced parent table cannot specify an alias.');

      const parLoc = addLocPart(specLoc, `parent table '${parentSpec.table}' via "${parentSpec.referenceName}"`);

      sqlParts.addParts(this.referencedParentSqlParts(parentSpec, relId, alias, parLoc));
    }

    return sqlParts;
  }

  private referencedParentSqlParts
    (
      parent: ReferencedParentSpec,
      childRelId: RelId,
      childAlias: string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const parentPkCond = this.getParentPrimaryKeyCondition(parent, childRelId, childAlias, specLoc);

    const parentRowObjectSql = this.jsonObjectRowsSql(parent, [], parentPkCond, null, specLoc);

    return new SqlParts(new Set(), [{
      entryType: 'parent-ref',
      projectedName: parent.referenceName,
      parentRowObjectSql,
      comment: `reference '${parent.referenceName}' to parent table '${parent.table}'`
    }]);
  }

  private childCollectionSelectEntries
    (
      tj: TableJsonSpec,
      parentRelId: RelId,
      parentAlias: string,
      specLoc: SpecLocation
    )
    : ChildCollectionSelectEntry[]
  {
    if (!tj.childTables)
      return [];

    return tj.childTables.map(child => {
      const childLoc = addLocPart(specLoc, `collection '${child.collectionName}' of "${child.table}" table records`);

      const childRelId = identifyTable(child.table, this.defaultSchema, this.dbmd, childLoc);

      const childFkCond = this.getChildForeignKeyCondition(child, childRelId, parentRelId, parentAlias, childLoc);

      const unwrap = child.unwrap ?? false;

      if ( unwrap && jsonPropertiesCount(child) > 1 )
        throw new SpecError(childLoc, 'Unwrapped child collection cannot have multiple field expressions.');

      const collectionSql = this.jsonArrayRowSql(child, childFkCond, unwrap, child.orderBy, childLoc);

      return {
        entryType: 'child-coll',
        projectedName: child.collectionName,
        collectionSql,
        comment: `collection '${child.collectionName}' of records from child table '${child.table}'`,
      };
    });
  }

  private getChildForeignKeyCondition
    (
      childSpec: ChildSpec,
      childRelId: RelId,
      parentRelId: RelId,
      parentAlias: string,
      specLoc: SpecLocation
    )
    : ChildForeignKeyCondition
  {
    const customJoin = childSpec.customJoinCondition;

    if (customJoin != undefined) // custom join condition specified
    {
      if (childSpec.foreignKeyFields)
        throw new SpecError(specLoc, 'Child collection with customJoinCondition cannot also specify foreignKeyFields.');

      const customJoinLoc = addLocPart(specLoc, 'custom join condition');
      validateCustomJoinCondition(customJoin, childRelId, parentRelId, this.dbmd, customJoinLoc);

      return { condType: 'fk', parentAlias, matchedFields: this.getMatchedFields(customJoin) };
    }
    else // foreign key join condition
    {
      const fkFields = childSpec.foreignKeyFields && new Set(childSpec.foreignKeyFields);
      const fk = this.getForeignKey(childRelId, parentRelId, fkFields, specLoc);

      return { condType: 'fk', parentAlias, matchedFields: fk.foreignKeyComponents };
    }
  }

  private getForeignKey
    (
      childRelId: RelId,
      parentRelId: RelId,
      foreignKeyFields: Set<string> | undefined,
      specLoc: SpecLocation
    )
    : ForeignKey
  {
    const fk = this.dbmd.getForeignKeyFromTo(childRelId, parentRelId, foreignKeyFields);

    if (fk == null)
      throw new SpecError(specLoc, `No foreign key found from ${childRelId.name} to ${parentRelId.name} via ` +
        (foreignKeyFields != undefined ? `foreign keys [${Array.from(foreignKeyFields)}]`
         : 'implicit foreign key fields') + '.');

    return fk;
  }

  getMatchedFields(customJoin: CustomJoinCondition)
  {
    return customJoin.equatedFields.map(eqfs => ({
      foreignKeyFieldName: this.quotable(eqfs.childField),
      primaryKeyFieldName: this.quotable(eqfs.parentPrimaryKeyField)
    }));
  }

  jsonPropertyName
    (
      tfe: string | TableFieldExpr,
      specLoc: SpecLocation
    )
    : string
  {
    if (typeof tfe === 'string')
      return this.propertyNameFn(tfe);
    else if (tfe.field)
      return tfe.jsonProperty || this.propertyNameFn(tfe.field);
    else
    {
      if (!tfe.expression)
        throw new SpecError(specLoc, `'field' or 'expression' must be provided`);
      if (!tfe.jsonProperty)
        throw new SpecError(specLoc, `Json property name is required for expression field ${tfe.expression}.`);
      return tfe.jsonProperty;
    }
  }

  // Return a string put into canonical unquoted and properly-cased form for the database.
  // If double quotes were added arond the returned name, it should be interpreted as the original
  // would have been by the database.
  private quotable(name: string): string
  {
    return exactUnquotedName(name, this.dbmd.caseSensitivity);
  }
} // QuerySQLSpecGenerator


function jsonPropertiesCount(tjs: TableJsonSpec): number
{
  return (
    (tjs.fieldExpressions?.length || 0) +
    (tjs.childTables?.length || 0) +
    getReferencedParentSpecs(tjs).length +
    getInlineParentSpecs(tjs).reduce(
      (count, p) => count + jsonPropertiesCount(p),
      0
    )
  );
}

const HIDDEN_PK_PREFIX = '_';

function specError(querySpec: QuerySpec, queryPart: string, problem: string): SpecError
{
  return new SpecError({ queryName: querySpec.queryName, queryPart }, problem);
}
