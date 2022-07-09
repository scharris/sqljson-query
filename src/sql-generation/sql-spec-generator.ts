import {
  caseNormalizeName, exactUnquotedName, makeMap, makeNameNotInSet, Nullable, relIdDescn
} from '../util/mod';
import { DatabaseMetadata, Field, ForeignKey, foreignKeyFieldNames, RelId } from '../dbmd';
import {
  QuerySpec, TableJsonSpec, ResultRepr, SpecLocation, addLocPart, SpecError, TableFieldExpr, ChildSpec,
  CustomMatchCondition, ParentSpec, getInlineParentSpecs, getReferencedParentSpecs, identifyTable,
  validateCustomMatchCondition, verifyTableFieldExpressionsValid, AdditionalObjectPropertyColumn, InlineParentSpec
} from '../query-specs';
import {
  SqlSpec, SqlParts, SelectEntry, ChildCollectionSelectEntry, ChildForeignKeyCondition,
  ParentPrimaryKeyCondition, HiddenPrimaryKeySelectEntry, getPropertySelectEntries,
} from './sql-specs';

export class SqlSpecGenerator
{
  constructor
    (
      private readonly dbmd: DatabaseMetadata,
      private readonly defaultSchema: Nullable<string>,
      private readonly propertyNameFn: (fieldName: string) => string,
    )
  {}

  public generateSqlSpecs(querySpec: QuerySpec): Map<ResultRepr,SqlSpec>
  {
    const resReps = querySpec.resultRepresentations ?? ['JSON_OBJECT_ROWS'];
    if (resReps.length === 0)
      throw specError(querySpec, 'resultRepresentations', 'One or more result representations must be specified.');

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
      tjs: TableJsonSpec,
      parentChildCond: Nullable<ParentPrimaryKeyCondition | ChildForeignKeyCondition>,
      orderBy: Nullable<string>,
      specLoc: SpecLocation,
      exportPkFieldsHidden?: 'export-pk-fields-hidden',
    )
    : SqlSpec
  {
    const sqlb = new SqlParts();

    const relId = identifyTable(tjs.table, this.defaultSchema, this.dbmd, specLoc);

    const alias = tjs.alias || sqlb.createTableAlias(relId.name);

    sqlb.addFromEntry({ entryType: 'table', table: { ...relId }, alias });

    // If we have a condition from a related table, register other table's alias to avoid shadowing it.
    if (parentChildCond)
      sqlb.addAlias(parentChildCond.condType === 'pcc-on-fk'
        ? parentChildCond.parentAlias
        : parentChildCond.childAlias
      );

    if (exportPkFieldsHidden)
      sqlb.addSelectEntries(this.hiddenPrimaryKeySelectEntries(relId, alias));

    sqlb.addSelectEntries(this.tableFieldExpressionSelectEntries(tjs, alias, specLoc));

    sqlb.addParts(this.inlineParentsSqlParts(tjs, relId, alias, sqlb.getAliases(), specLoc));

    sqlb.addParts(this.referencedParentsSqlParts(tjs, relId, alias, specLoc));

    sqlb.addSelectEntries(this.childCollectionSelectEntries(tjs, relId, alias, specLoc));

    if (parentChildCond)
      sqlb.addWhereEntry({...parentChildCond, fromAlias: alias });

    if (tjs.recordCondition)
      sqlb.addWhereEntry({
        condType: 'general',
        condSql: tjs.recordCondition.sql,
        tableAliasPlaceholderInCondSql: tjs.recordCondition.withTableAliasAs,
        tableAlias: alias
      });

    if (orderBy != null)
      sqlb.setOrderBy({ orderBy, tableAlias: alias });

    if (tjs.resultTypeName)
      sqlb.setResultTypeName(tjs.resultTypeName);

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
      tjs: TableJsonSpec,
      additionalObjectPropertyColumns: AdditionalObjectPropertyColumn[],
      pkCond: Nullable<ParentPrimaryKeyCondition>,
      orderBy: Nullable<string>,
      specLoc: SpecLocation
    )
    : SqlSpec
  {
    return {
      ...this.baseSql(tjs, pkCond, orderBy, specLoc),
      objectWrapProperties: true,
      additionalObjectPropertyColumns
    };
  }

  /// Make query SQL having a single row and column result, with the result value
  /// representing the collection of json object representations of all rows of
  /// the table whose output specification is passed.
  private jsonArrayRowSql
    (
      tjs: TableJsonSpec,
      childFkCond: Nullable<ChildForeignKeyCondition>,
      unwrap: boolean,
      orderBy: Nullable<string>,
      specLoc: SpecLocation
    )
    : SqlSpec
  {
    const baseSql = this.baseSql(tjs, childFkCond, orderBy, specLoc);

    if (unwrap && getPropertySelectEntries(baseSql).length != 1)
      throw new SpecError(specLoc, 'Unwrapped collections cannot have multiple properties.');

    return {
      ...baseSql,
      aggregateToArray: true,
      objectWrapProperties: !unwrap,
      fromEntriesLeadingComment: `base query for table '${tjs.table}'`,
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
      entryType: 'se-hidden-pkf',
      pkFieldName: pkField,
      projectedName: HIDDEN_PK_PREFIX + pkField,
      tableAlias
    }));
  }

  private tableFieldExpressionSelectEntries
    (
      tjs: TableJsonSpec,
      tableAlias: string,
      specLoc: SpecLocation
    )
    : SelectEntry[]
  {
    verifyTableFieldExpressionsValid(tjs, this.defaultSchema, this.dbmd, specLoc);

    if (!tjs.fieldExpressions)
      return [];

    const dbFieldsByName: Map<string,Field> = this.getTableFieldsByName(tjs.table, specLoc);

    return tjs.fieldExpressions.map((tfe, ix) => {
      const feLoc = addLocPart(specLoc, `fieldExpressions entry #${ix+1} of table ${tjs.table}`);
      const projectedName = this.jsonPropertyName(tfe, feLoc);

      if (typeof tfe === 'string' || tfe.field != null)
      {
        const fieldName = typeof tfe === 'string' ? tfe : tfe.field;
        const dbField = dbFieldsByName.get(caseNormalizeName(fieldName, this.dbmd.caseSensitivity));
        if (dbField == undefined)
          throw new SpecError(specLoc, `No metadata found for field ${tjs.table}.${fieldName}.`);

        return {
          entryType: 'se-field',
          field: dbField,
          projectedName,
          tableAlias,
          displayOrder: typeof tfe === 'string' ? undefined : tfe.displayOrder,
          sourceCodeFieldType: typeof tfe === 'string' ? null : tfe.fieldTypeInGeneratedSource,
        };
      }
      else // general expression
      {
        if (!tfe.expression)
          throw new SpecError(feLoc, `'field' or 'expression' must be provided`);

        return {
          entryType: 'se-expr',
          projectedName,
          expression: tfe.expression,
          tableAliasPlaceholderInExpr: tfe.withTableAliasAs,
          tableAlias,
          displayOrder: tfe.displayOrder,
          sourceCodeFieldType: tfe.fieldTypeInGeneratedSource,
        };
      }
    });
  }

  private inlineParentsSqlParts
    (
      tjs: TableJsonSpec,
      relId: RelId,
      alias: string,
      aliasesInScope: Set<string>,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts(aliasesInScope);

    for (const parent of getInlineParentSpecs(tjs))
    {
      const ipLoc = addLocPart(specLoc, `parent table '${parent.table}'`);

      sqlParts.addParts(this.inlineParentSqlParts(parent, relId, alias, sqlParts.getAliases(), ipLoc));
    }

    return sqlParts;
  }

  // Return sql parts for the *including* (child) table's SQL query which are contributed by the inline parent table.
  private inlineParentSqlParts
    (
      parentSpec: InlineParentSpec,
      childRelId: RelId,
      childAlias: string,
      avoidAliases: Set<string>,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts();

    const subqueryAlias = parentSpec.subqueryAlias || makeNameNotInSet('q', avoidAliases);
    sqlParts.addAlias(subqueryAlias);

    const parentPropsSql = this.baseSql(parentSpec, null, null, specLoc, 'export-pk-fields-hidden');

    const matchedFields =
      this.getParentPrimaryKeyCondition(parentSpec, childRelId, childAlias, specLoc)
      .matchedFields
      .map(fp => ({ ...fp, primaryKeyFieldName: HIDDEN_PK_PREFIX + fp.primaryKeyFieldName }));

    const matchMustExist =
      parentSpec.recordCondition == null && (
        parentSpec.customMatchCondition == null ?
          this.someFkFieldNotNullable(childRelId, parentSpec, specLoc)
          : (parentSpec.customMatchCondition?.matchAlwaysExists ?? false)
      );

    sqlParts.addFromEntry({
      entryType: 'query',
      query: parentPropsSql,
      alias: subqueryAlias,
      join: {
        joinType: 'LEFT',
        parentChildCondition: {
          condType: 'pcc-on-fk',
          fromAlias: childAlias,
          parentAlias: subqueryAlias,
          matchedFields,
          matchMustExist
        },
      },
      comment: `parent table '${parentSpec.table}', joined for inlined fields`
    });

    const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, specLoc);

    for (const [ix, parentPropSelectEntry] of getPropertySelectEntries(parentPropsSql).entries())
    {
      sqlParts.addSelectEntry({
        entryType: 'se-inline-parent-prop',
        projectedName: parentPropSelectEntry.projectedName,
        parentAlias: subqueryAlias,
        parentTable: parentRelId,
        comment: ix === 0 ? `field(s) inlined from parent table '${parentSpec.table}'` : null,
        displayOrder: parentPropSelectEntry.displayOrder,
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
    const customMatch = parentSpec.customMatchCondition;

    if (customMatch)
    {
      if (parentSpec.viaForeignKeyFields != undefined)
        throw new SpecError(specLoc, 'Parent with customMatchCondition cannot specify foreignKeyFields.');

      const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, specLoc);

      validateCustomMatchCondition(customMatch, childRelId, parentRelId, this.dbmd, addLocPart(specLoc,'custom match'));

      return {
        condType: 'pcc-on-pk',
        childAlias,
        matchedFields: this.getMatchedFields(customMatch),
        matchMustExist: customMatch.matchAlwaysExists ?? false,
      };
    }
    else
    {
      const childForeignKeyFieldsSet = parentSpec.viaForeignKeyFields && new Set(parentSpec.viaForeignKeyFields);
      const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, specLoc);
      const fk = this.getForeignKey(childRelId, parentRelId, childForeignKeyFieldsSet, specLoc);

      return {
        condType: 'pcc-on-pk',
        childAlias,
        matchedFields: fk.foreignKeyComponents,
        matchMustExist: this.someFkFieldNotNullable(childRelId, parentSpec, specLoc)
      };
    }
  }

  private referencedParentsSqlParts
    (
      tjs: TableJsonSpec,
      relId: RelId,
      alias: string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts();

    for (const parentSpec of getReferencedParentSpecs(tjs))
    {
      const parLoc = addLocPart(specLoc, `parent table '${parentSpec.table}' via "${parentSpec.referenceName}"`);
      const parentPkCond = this.getParentPrimaryKeyCondition(parentSpec, relId, alias, parLoc);

      const parentRowObjectSql = this.jsonObjectRowsSql(parentSpec, [], parentPkCond, null, parLoc);

      sqlParts.addSelectEntry({
        entryType: 'se-parent-ref',
        projectedName: parentSpec.referenceName,
        parentRowObjectSql,
        comment: `reference '${parentSpec.referenceName}' to parent table '${parentSpec.table}'`,
        displayOrder: parentSpec.displayOrder
      });
    }

    return sqlParts;
  }

  private childCollectionSelectEntries
    (
      tjs: TableJsonSpec,
      parentRelId: RelId,
      parentAlias: string,
      specLoc: SpecLocation
    )
    : ChildCollectionSelectEntry[]
  {
    if (!tjs.childTables)
      return [];

    return tjs.childTables.map(childSpec => {
      const childLoc = addLocPart(specLoc, `collection '${childSpec.collectionName}' of "${childSpec.table}" records`);

      const childRelId = identifyTable(childSpec.table, this.defaultSchema, this.dbmd, childLoc);

      const childFkCond = this.getChildForeignKeyCondition(childSpec, childRelId, parentRelId, parentAlias, childLoc);

      const unwrap = childSpec.unwrap ?? false;

      if ( unwrap && jsonPropertiesCount(childSpec) > 1 )
        throw new SpecError(childLoc, 'Unwrapped child collection cannot have multiple field expressions.');

      const collectionSql = this.jsonArrayRowSql(childSpec, childFkCond, unwrap, childSpec.orderBy, childLoc);

      return {
        entryType: 'se-child-coll',
        projectedName: childSpec.collectionName,
        collectionSql,
        comment: `collection '${childSpec.collectionName}' of records from child table '${childSpec.table}'`,
        displayOrder: childSpec.displayOrder
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
    const customMatchCond = childSpec.customMatchCondition;

    if (customMatchCond)
    {
      if (childSpec.foreignKeyFields)
        throw new SpecError(specLoc, 'Child collection with customMatchCondition cannot also specify foreignKeyFields.');

      const customMatchLoc = addLocPart(specLoc, 'custom match condition');
      validateCustomMatchCondition(customMatchCond, childRelId, parentRelId, this.dbmd, customMatchLoc);

      return {
        condType: 'pcc-on-fk',
        parentAlias,
        matchedFields: this.getMatchedFields(customMatchCond),
        matchMustExist: false,
      };
    }
    else // foreign key join condition
    {
      const fkFields = childSpec.foreignKeyFields && new Set(childSpec.foreignKeyFields);
      const fk = this.getForeignKey(childRelId, parentRelId, fkFields, specLoc);

      return {
        condType: 'pcc-on-fk',
        parentAlias,
        matchedFields: fk.foreignKeyComponents,
        matchMustExist: false
      };
    }
  }

  private getForeignKey
    (
      childRelId: RelId,
      parentRelId: RelId,
      foreignKeyFields: Nullable<Set<string>>,
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

  private getTableFieldsByName
    (
      table: string | RelId,
      specLoc: SpecLocation
    )
    : Map<string,Field>
  {
    const relId =
      typeof table === 'string'
        ? identifyTable(table, this.defaultSchema, this.dbmd, specLoc)
        : table;
    const relMd = this.dbmd.getRelationMetadata(relId);
    if (relMd == null)
      throw new SpecError(specLoc, `Metadata for table ${relIdDescn(relId)} not found.`);

    return makeMap(relMd.fields, f => f.name, f => f);
  }

  getMatchedFields(customMatch: CustomMatchCondition)
  {
    return customMatch.equatedFields.map(eqfs => ({
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

  private someFkFieldNotNullable
  (
    childRelId: RelId,
    parentSpec: ParentSpec,
    specLoc: SpecLocation
  )
  : boolean
{
  const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, specLoc);
  const specFkFields = parentSpec.viaForeignKeyFields && new Set(parentSpec.viaForeignKeyFields) || null;
  const fk = this.dbmd.getForeignKeyFromTo(childRelId, parentRelId, specFkFields);
  if (!fk) throw new SpecError(specLoc,
    `Foreign key from ${relIdDescn(childRelId)} to parent ${relIdDescn(parentRelId)} not found.`
  );
  const childFieldsByName = this.getTableFieldsByName(childRelId, specLoc);

  return foreignKeyFieldNames(fk).some(fkFieldName => {
    const fkField = childFieldsByName.get(fkFieldName);
    if (!fkField) throw new SpecError(specLoc,
      `Field not found for fk field ${fkFieldName} of table ${relIdDescn(childRelId)}.`
    );
    return fkField?.nullable === false;
  });
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