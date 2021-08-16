import {
  makeMap, mapSet, caseNormalizeName, quoteIfNeeded, valueOr, propertyNameDefaultFunction, indentLines,
  lowerCaseInitials, makeNameNotInSet, replaceAll
} from './util/mod';
import {
  QuerySpec, TableJsonSpec, ResultRepr, SpecLocation, addLocPart, SpecError, TableFieldExpr, ChildSpec,
  CustomJoinCondition, ParentSpec, ReferencedParentSpec, InlineParentSpec, getInlineParentSpecs,
  getReferencedParentSpecs,
} from './query-specs';
import {identifyTable, validateCustomJoinCondition, verifyTableFieldExpressionsValid} from './query-spec-validations';
import {SqlDialect, getSqlDialect} from './sql-dialects';
import {DatabaseMetadata, ForeignKey, ForeignKeyComponent, RelId, relIdString} from './database-metadata';

export class QuerySqlGenerator
{
  private readonly sqlDialect: SqlDialect;
  private readonly unqualifiedNamesSchemas: Set<string>; // Can use unqualified database object names in these schemas.

  private static readonly HIDDEN_PK_PREFIX = "_";
  private static readonly DEFAULT_RESULT_REPRS: ResultRepr[] = ['JSON_OBJECT_ROWS'];

  constructor
    (
      private readonly dbmd: DatabaseMetadata,
      private readonly defaultSchema: string | null,
      unqualifiedNamesSchemas: Set<string>,
      private readonly defaultPropertyNameFn: (fieldName: string) => string,
      private readonly indentSpaces: number = 2
    )
  {
    this.unqualifiedNamesSchemas = mapSet(unqualifiedNamesSchemas, s => this.dbNormd(s));
    this.sqlDialect = getSqlDialect(dbmd, indentSpaces);
  }

  public generateSqls(querySpec: QuerySpec): Map<ResultRepr,string>
  {
    // This query spec may customize the default generated field name making function.
    const propNameFn = querySpec.propertyNameDefault ? propertyNameDefaultFunction(querySpec.propertyNameDefault)
      : this.defaultPropertyNameFn;

    const resReprs = querySpec.resultRepresentations || QuerySqlGenerator.DEFAULT_RESULT_REPRS;

    return makeMap(resReprs, rrep => rrep, resRepr =>
      this.queryResultReprSql(querySpec, resRepr, propNameFn)
    );
  }

  /// Make SQL for the given query spec and result representation.
  private queryResultReprSql
    (
      querySpec: QuerySpec,
      resultRepr: ResultRepr,
      propNameFn: (dbFieldName: string) => string
    )
    : string
  {
    const tjs = querySpec.tableJson;
    const specLoc = { queryName: querySpec.queryName }; // for error reporting
    if ( querySpec.forUpdate && resultRepr !== 'MULTI_COLUMN_ROWS' )
      throw specError(querySpec, "for update clause", "FOR UPDATE only allowed with MULTI_COLUMN_ROWS results");

    switch ( resultRepr )
    {
      case 'JSON_OBJECT_ROWS':
        return this.jsonObjectRowsSql(tjs, null, querySpec.orderBy, propNameFn, specLoc);
      case 'JSON_ARRAY_ROW':
        return this.jsonArrayRowSql(tjs, null, false, querySpec.orderBy, propNameFn, specLoc);
      case 'MULTI_COLUMN_ROWS':
        return this.baseQuery(tjs, null, false, querySpec.orderBy, propNameFn, specLoc).sql
          + (querySpec.forUpdate ? "\nfor update" : "");
      default:
        throw specError(querySpec, "resultRepresentations", "Result representation is not valid.");
    }
  }

  private baseQuery
    (
      tableSpec: TableJsonSpec,
      parentChildCond: ParentChildCondition | null,
      exportPkFieldsHidden: boolean,
      orderBy: string | null | undefined,
      propNameFn: (fieldName: string) => string,
      specLoc: SpecLocation
    )
    : BaseQuery
  {
    const q = new SqlParts();

    const relId = identifyTable(tableSpec.table, this.defaultSchema, this.dbmd, specLoc);
    const alias = q.makeNewAliasFor(relId.name);
    q.fromEntries.push(this.minimalRelIdentifier(relId) + " " + alias);

    if ( parentChildCond )
      q.aliasesInScope.add(parentChildCond.otherTableAlias());

    if ( exportPkFieldsHidden )
      q.selectEntries.push(
        ...this.hiddenPkSelectEntries(relId, alias)
      );

    q.selectEntries.push(
      ...this.tableFieldExpressionSelectEntries(tableSpec, alias, propNameFn, specLoc)
    );

    q.addParts(
      this.inlineParentsSqlParts(getInlineParentSpecs(tableSpec), relId, alias, q.aliasesInScope, propNameFn, specLoc)
    );

    q.addParts(
      this.referencedParentsSqlParts(getReferencedParentSpecs(tableSpec), relId, alias, propNameFn, specLoc)
    );

    q.selectEntries.push(
      ...this.childCollectionSelectEntries(tableSpec, relId, alias, propNameFn, specLoc)
    );

    // Add parent/child relationship filter condition if any to the where clause.
    if ( parentChildCond )
      q.whereEntries.push(
        parentChildCond.asEquationConditionOn(alias, this.dbmd)
      );

    const recordCond = recordConditionSql(tableSpec, alias);
    if ( recordCond )
      q.whereEntries.push(recordCond);

    if ( orderBy != null )
      q.orderBy = orderBy;

    const columnNames = q.selectEntries.filter(e => e.source !== 'HIDDEN_PK').map(e => e.name);

    return { sql: q.toSql(this.indentSpaces), resultColumnNames: columnNames };
  }

  private hiddenPkSelectEntries(relId: RelId, alias: string): SelectEntry[]
  {
    return this.dbmd.getPrimaryKeyFieldNames(relId).map(pkFieldName => {
      const pkFieldDbName = quoteIfNeeded(pkFieldName, this.dbmd.caseSensitivity);
      const pkFieldOutputName = quoteIfNeeded(QuerySqlGenerator.HIDDEN_PK_PREFIX + pkFieldName, this.dbmd.caseSensitivity);
      return {valueExpr: `${alias}.${pkFieldDbName}`, name: pkFieldOutputName, source: 'HIDDEN_PK'};
    });
  }

  private tableFieldExpressionSelectEntries
    (
      tableSpec: TableJsonSpec,
      alias: string,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : SelectEntry[]
  {
    verifyTableFieldExpressionsValid(tableSpec, this.defaultSchema, this.dbmd, specLoc);

    if ( !tableSpec.fieldExpressions )
      return [];
    else return tableSpec.fieldExpressions.map((tfe,ix) => {
      const loc = addLocPart(specLoc, `fieldExpressions entry #${ix+1} of table ${tableSpec.table}`);
      const name = quoteIfNeeded(jsonPropertyName(tfe, propNameFn, loc), this.dbmd.caseSensitivity);
      return { valueExpr: tableFieldExpressionSql(tfe, alias, loc), name, source: 'NATIVE_FIELD' };
    });
  }

  private inlineParentsSqlParts
    (
      inlineParentSpecs: InlineParentSpec[],
      relId: RelId,
      alias: string,
      aliasesInScope: Set<string>,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts([], [], [], aliasesInScope);

    for ( const [ix, parentSpec] of (inlineParentSpecs || []).entries() )
    {
      const parentLoc = addLocPart(specLoc,
        `inlineParentTables entry #${ix+1}, '${parentSpec.tableJson.table}' table`
      );
      sqlParts.addParts(
        this.inlineParentSqlParts(parentSpec, relId, alias, sqlParts.aliasesInScope, propNameFn, parentLoc)
      );
    }

    return sqlParts;
  }

  private inlineParentSqlParts
    (
      parentSpec: ParentSpec,
      childRelId: RelId,
      childAlias: string,
      avoidAliases: Set<string>,
      propNameFn: (fieldName: string) => string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const q = new SqlParts();

    const fromClauseQuery = this.baseQuery(parentSpec.tableJson, null, true, null, propNameFn, specLoc);

    const fromClauseQueryAlias = parentSpec.alias || makeNameNotInSet("q", avoidAliases);
    q.aliasesInScope.add(fromClauseQueryAlias);

    for ( const [i, parentColumnName] of fromClauseQuery.resultColumnNames.entries() )
    {
      q.selectEntries.push({
        valueExpr: `${fromClauseQueryAlias }.${parentColumnName}`,
        name: parentColumnName,
        source: 'INLINE_PARENT',
        comment: (i == 0 ? lineCommentInlineParentFieldsBegin(parentSpec): null)
      });
    }

    const joinCond =
      this.getParentPkCondition(parentSpec, childRelId, childAlias, specLoc)
          .asEquationConditionOn(fromClauseQueryAlias, this.dbmd, QuerySqlGenerator.HIDDEN_PK_PREFIX);

    q.fromEntries.push(
      lineCommentJoinToParent(parentSpec) + "\n" +
      "left join (\n" +
         this.indent(fromClauseQuery.sql) +
      ") " + fromClauseQueryAlias + " on " + joinCond
    );

    return q;
  }

  private getParentPkCondition
    (
      parentSpec: ParentSpec,
      childRelId: RelId,
      childAlias: string,
      specLoc: SpecLocation
    )
    : ParentPkCondition
  {
    const customJoinCond = parentSpec.customJoinCondition;

    if ( customJoinCond != undefined )
    {
      if ( parentSpec.viaForeignKeyFields != undefined )
        throw new SpecError(specLoc, "Parent with customJoinCondition cannot specify foreignKeyFields.");

      const parentRelId = identifyTable(parentSpec.tableJson.table, this.defaultSchema, this.dbmd, specLoc);
      validateCustomJoinCondition(customJoinCond, childRelId, parentRelId, this.dbmd, addLocPart(specLoc, "custom join condition"));

      return this.customJoinParentPkCondition(customJoinCond, childAlias);
    }
    else
    {
      const childForeignKeyFieldsSet = parentSpec.viaForeignKeyFields && new Set(parentSpec.viaForeignKeyFields );
      const parentRelId = identifyTable(parentSpec.tableJson.table, this.defaultSchema, this.dbmd, specLoc);
      const fk = this.getForeignKey(childRelId, parentRelId, childForeignKeyFieldsSet, specLoc);
      return new ParentPkCondition(childAlias, fk.foreignKeyComponents);
    }
  }

  private customJoinParentPkCondition
    (
      customJoinCond: CustomJoinCondition,
      childAlias: string
    )
    : ParentPkCondition
  {
    const virtualFkComps =
      customJoinCond.equatedFields.map(eqfs => ({
        foreignKeyFieldName: this.dbNormd(eqfs.childField),
        primaryKeyFieldName: this.dbNormd(eqfs.parentPrimaryKeyField)
      }));

    return new ParentPkCondition(childAlias, virtualFkComps);
  }

  private referencedParentsSqlParts
    (
      refdParentSpecs: ReferencedParentSpec[],
      relId: RelId,
      alias: string,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const sqlParts = new SqlParts();

    for ( const [ix, parentSpec] of refdParentSpecs.entries() )
    {
      if ( parentSpec.hasOwnProperty('alias') )
        throw new SpecError(specLoc, "Refrenced parent table cannot specify an alias.");

      const parentLoc = addLocPart(specLoc,
        `referencedParentTables entry #${ix+1}, '${parentSpec.tableJson.table}' table`
      );
      sqlParts.addParts(
        this.referencedParentSqlParts(parentSpec, relId, alias, propNameFn, parentLoc)
      );
    }

    return sqlParts;
  }

  private referencedParentSqlParts
    (
      parentSpec: ReferencedParentSpec,
      childRelId: RelId,
      childAlias: string,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : SqlParts
  {
    const parentPkCond = this.getParentPkCondition(parentSpec, childRelId, childAlias, specLoc);

    const selectEntries: SelectEntry[] = [{
      valueExpr:
        lineCommentReferencedParent(parentSpec) + "\n" +
        "(\n" +
          this.indent(
            this.jsonObjectRowsSql(parentSpec.tableJson, parentPkCond, null, propNameFn, specLoc)
          ) + "\n" +
        ")",
      name: quoteIfNeeded(parentSpec.referenceName, this.dbmd.caseSensitivity),
      source: 'PARENT_REFERENCE'
    }];

    return new SqlParts(selectEntries, [], [], new Set(), null);
  }

  private childCollectionSelectEntries
    (
      tableSpec: TableJsonSpec,
      relId: RelId,
      alias: string,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : SelectEntry[]
  {
    if ( !tableSpec.childTables )
      return [];
    return tableSpec.childTables.map(childCollSpec => {
      const childLoc = addLocPart(specLoc, `child collection '${childCollSpec.collectionName}'`);
      return {
        valueExpr:
          lineCommentChildCollectionSelectExpression(childCollSpec) + "\n" +
          "(\n" +
            this.indent(
              this.childCollectionQuery(childCollSpec, relId, alias, propNameFn, childLoc)
            ) + "\n" +
          ")",
        name: quoteIfNeeded(childCollSpec.collectionName, this.dbmd.caseSensitivity),
        source: 'CHILD_COLLECTION'
      };
   });
  }

  private childCollectionQuery
    (
      childSpec: ChildSpec,
      parentRelId: RelId,
      parentAlias: string,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : string
  {
    const tableSpec = childSpec.tableJson;

    const childRelId = identifyTable(tableSpec.table, this.defaultSchema, this.dbmd, specLoc);

    const pcCond = this.getChildFkCondition(childSpec, childRelId, parentRelId, parentAlias, specLoc);

    const unwrapChildValues = valueOr(childSpec.unwrap, false);
    if ( unwrapChildValues && jsonPropertiesCount(childSpec.tableJson) > 1 )
      throw new SpecError(specLoc, "Unwrapped child collection option is incompatible with multiple field expressions.");

    return this.jsonArrayRowSql(tableSpec, pcCond, unwrapChildValues, childSpec.orderBy, propNameFn, specLoc);
  }

  private getChildFkCondition
    (
      childCollectionSpec: ChildSpec,
      childRelId: RelId,
      parentRelId: RelId,
      parentAlias: string,
      specLoc: SpecLocation
    )
    : ChildFkCondition
  {
    const customJoinCond = childCollectionSpec.customJoinCondition;

    if ( customJoinCond != undefined ) // custom join condition specified
    {
      if ( childCollectionSpec.foreignKeyFields )
        throw new SpecError(specLoc, "Child collection that specifies customJoinCondition cannot specify foreignKeyFields.");
      validateCustomJoinCondition(customJoinCond, childRelId, parentRelId, this.dbmd, addLocPart(specLoc, "custom join condition"));
      return this.customJoinChildFkCondition(customJoinCond, parentAlias);
    }
    else // foreign key join condition
    {
      const fkFields = childCollectionSpec.foreignKeyFields && new Set(childCollectionSpec.foreignKeyFields);
      const fk = this.getForeignKey(childRelId, parentRelId, fkFields, specLoc);
      return new ChildFkCondition(parentAlias, fk.foreignKeyComponents);
    }
  }

  private customJoinChildFkCondition
    (
      customJoinCond: CustomJoinCondition,
      parentAlias: string
    )
    : ChildFkCondition
  {
    const virtualFkComps =
      customJoinCond.equatedFields.map(eqfs => ({
        foreignKeyFieldName: this.dbNormd(eqfs.childField),
        primaryKeyFieldName: this.dbNormd(eqfs.parentPrimaryKeyField)
      }));

    return new ChildFkCondition(parentAlias, virtualFkComps);
  }

  /// Make query SQL having a single row and column result, with the result value
  /// representing the collection of json object representations of all rows of
  /// the table whose output specification is passed.
  private jsonArrayRowSql
    (
      tableSpec: TableJsonSpec,
      parentChildCond: ParentChildCondition | null,
      unwrap: boolean,
      orderBy: string | null | undefined,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : string
  {
    const baseQuery = this.baseQuery(tableSpec, parentChildCond, false, null, propNameFn, specLoc);

    if ( unwrap && baseQuery.resultColumnNames.length != 1 )
      throw new SpecError(specLoc, "Unwrapped child collections cannot have multiple field expressions.");

    return (
      "select\n" +
        this.indent(lineCommentAggregatedRowObjects(tableSpec)) + "\n" +
        this.indent(
          (unwrap
            ? this.sqlDialect.getAggregatedColumnValuesExpression(baseQuery.resultColumnNames[0], orderBy, "q")
            : this.sqlDialect.getAggregatedRowObjectsExpression(baseQuery.resultColumnNames, orderBy, "q"))
          ) + " json\n" +
      "from (\n" +
        this.indent(lineCommentBaseTableQuery(tableSpec)) + "\n" +
        this.indent(baseQuery.sql) +
      ") q"
    );
  }

  /// Make query SQL having JSON object result values at the top level of the
  /// result set. The query returns a JSON value in a single column and with
  /// any number of result rows.
  private jsonObjectRowsSql
    (
      tjSpec: TableJsonSpec,
      parentChildCond: ParentChildCondition | null,
      orderBy: string | null | undefined,
      propNameFn: (dbFieldName: string) => string,
      specLoc: SpecLocation
    )
    : string
  {
    const baseQuery = this.baseQuery(tjSpec, parentChildCond, false, null, propNameFn, specLoc);

    return (
      "select\n" +
        this.indent(lineCommentTableRowObject(tjSpec)) + "\n" +
        this.indent(this.sqlDialect.getRowObjectExpression(baseQuery.resultColumnNames, "q")) + " json\n" +
      "from (\n" +
        this.indent(lineCommentBaseTableQuery(tjSpec)) + "\n" +
        this.indent(baseQuery.sql) +
      ") q" +
      (orderBy != null ? "\norder by " + orderBy.replace(/\$\$/g, "q") : "")
    );
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

    if ( fk == null )
      throw new SpecError(specLoc, `No foreign key found from ${childRelId.name} to ${parentRelId.name} via ` +
        (foreignKeyFields != undefined ? `foreign keys [${Array.from(foreignKeyFields)}]`
         : "implicit foreign key fields") + ".");

    return fk;
  }

  /// Return a possibly qualified identifier for the given relation, omitting the schema
  /// qualifier if it has a schema for which it's specified to use unqualified names.
  private minimalRelIdentifier(relId: RelId): string
  {
    const schema = relId.schema;
    return !schema || this.unqualifiedNamesSchemas.has(this.dbNormd(schema)) ? relId.name
      : relIdString(relId);
  }

  private dbNormd(name: string): string
  {
    return caseNormalizeName(name, this.dbmd.caseSensitivity);
  }

  private indent(s: string): string
  {
    return indentLines(s, this.indentSpaces, true);
  }

}

function specError(querySpec: QuerySpec, queryPart: string, problem: string): SpecError
{
  return new SpecError({ queryName: querySpec.queryName, queryPart }, problem);
}

interface BaseQuery
{
  readonly sql: string;
  readonly resultColumnNames: string[];
}

/// Represents some condition on a table in context with reference to another
/// table which is identified by its alias.
interface ParentChildCondition
{
  asEquationConditionOn (tableAlias: string, dbmd: DatabaseMetadata): string;

  otherTableAlias(): string;
}

class ParentPkCondition implements ParentChildCondition
{
  constructor
  (
    readonly childAlias: string,
    readonly matchedFields: ForeignKeyComponent[]
  )
  { }

  otherTableAlias(): string { return this.childAlias; }

  asEquationConditionOn(parentAlias: string, dbmd: DatabaseMetadata, parentPkPrefix: string = ""): string
  {
    return (
      this.matchedFields.map(mf =>
        `${this.childAlias}.${quoteIfNeeded(mf.foreignKeyFieldName, dbmd.caseSensitivity)}` +
        " = " +
        `${parentAlias}.${quoteIfNeeded(parentPkPrefix + mf.primaryKeyFieldName, dbmd.caseSensitivity)}`
      )
      .join(" and ")
    );
  }
}

class ChildFkCondition implements ParentChildCondition
{
  constructor
  (
    readonly parentAlias: string,
    readonly matchedFields: ForeignKeyComponent[]
  )
  { }

  otherTableAlias(): string { return this.parentAlias; }

  asEquationConditionOn(childAlias: string, dbmd: DatabaseMetadata): string
  {
    return (
      this.matchedFields.map(mf =>
        `${childAlias}.${quoteIfNeeded(mf.foreignKeyFieldName, dbmd.caseSensitivity)}` +
        " = " +
        `${this.parentAlias}.${quoteIfNeeded(mf.primaryKeyFieldName, dbmd.caseSensitivity)}`
      )
      .join(" and ")
    );
  }
}

class SqlParts
{
  constructor
  (
    readonly selectEntries: SelectEntry[] = [],
    readonly fromEntries: string[] = [],
    readonly whereEntries: string[] = [],
    readonly aliasesInScope: Set<string> = new Set(),
    public orderBy: string | null = null
  )
  {}

  addAliasesToScope(aliases: Set<string>) { aliases.forEach(a => this.aliasesInScope.add(a)); }

  addParts(otherParts: SqlParts)
  {
    this.selectEntries.push(...otherParts.selectEntries);
    this.fromEntries.push(...otherParts.fromEntries);
    this.whereEntries.push(...otherParts.whereEntries);
    this.addAliasesToScope(otherParts.aliasesInScope);
  }

  makeNewAliasFor(dbObjectName: string): string
  {
    const alias = makeNameNotInSet(lowerCaseInitials(dbObjectName, "_"), this.aliasesInScope);
    this.aliasesInScope.add(alias);
    return alias;
  }

  toSql(indentSpaces: number): string
  {
    function makeSelectClauseEntrySql(sce: SelectEntry): string
    {
      const exprNameSep = sce.name.startsWith("\"") ? " " : " as ";
      return (sce.comment != null ? sce.comment + "\n" : "") +
        sce.valueExpr + exprNameSep + sce.name;
    }

    return (
      "select\n" +
        indentLines(this.selectEntries.map(makeSelectClauseEntrySql).join(",\n"), indentSpaces) + "\n" +
      "from\n" +
        indentLines(this.fromEntries.join("\n"), indentSpaces) + "\n" +
      (this.whereEntries.length === 0 ? "":
      "where (\n" +
        indentLines(this.whereEntries.join(" and\n"), indentSpaces) + "\n" +
      ")\n") +
      (this.orderBy ? "order by " + this.orderBy + "\n": "")
    );
  }
}

interface SelectEntry
{
  readonly valueExpr: string;
  readonly name: string;
  readonly source: SelectEntrySource;
  readonly comment?: string | null;
}

type SelectEntrySource = 'NATIVE_FIELD' | 'INLINE_PARENT' | 'PARENT_REFERENCE' | 'CHILD_COLLECTION' | 'HIDDEN_PK';


const DEFAULT_TABLE_ALIAS_VAR = "$$";

function jsonPropertyName
  (
    tfe: string | TableFieldExpr,
    propNameFn: (dbFieldName: string) => string,
    specLoc: SpecLocation
  )
  : string
{
  if ( typeof tfe === 'string' )
    return propNameFn(tfe);
  else if ( tfe.field )
    return tfe.jsonProperty || propNameFn(tfe.field);
  else
  {
    if ( !tfe.expression )
      throw new SpecError(specLoc, "'field' or 'expression' must be provided");
    if ( !tfe.jsonProperty )
      throw new SpecError(specLoc, `Json property name is required for expression field ${tfe.expression}.`);
    return tfe.jsonProperty;
  }
}

function tableFieldExpressionSql
  (
    tableFieldExpr: string | TableFieldExpr,
    tableAlias: string,
    specLoc: SpecLocation
  )
  : string
{
  if ( typeof tableFieldExpr === 'string')
    return `${tableAlias}.${tableFieldExpr}`;
  else if ( tableFieldExpr.field )
    return `${tableAlias}.${tableFieldExpr.field}`;
  else // general expression
  {
    if ( !tableFieldExpr.expression )
      throw new SpecError(specLoc, "'field' or 'expression' must be provided");
    const tableAliasVarInExpr = tableFieldExpr.withTableAliasAs || DEFAULT_TABLE_ALIAS_VAR;
    return replaceAll(tableFieldExpr.expression, tableAliasVarInExpr, tableAlias);
  }
}

function recordConditionSql
  (
    tableSpec: TableJsonSpec,
    tableAlias: string
  )
  : string | null
{
  const cond = tableSpec.recordCondition;
  if ( cond )
  {
    const tableAliasVar = valueOr(cond.withTableAliasAs, DEFAULT_TABLE_ALIAS_VAR);
    return `(${replaceAll(cond.sql, tableAliasVar, tableAlias)})`;
  }
  else
    return null;
}

function jsonPropertiesCount(tjs: TableJsonSpec): number
{
  return (
    (tjs.fieldExpressions?.length || 0) +
    (tjs.childTables?.length || 0) +
    getReferencedParentSpecs(tjs).length +
    getInlineParentSpecs(tjs).reduce(
      (count, p) => count + jsonPropertiesCount(p.tableJson),
      0
    )
  );
}

function lineCommentTableRowObject(tableJsonSpec: TableJsonSpec): string
{
  return `-- row object for table '${tableJsonSpec.table}'`;
}

function lineCommentBaseTableQuery(tableSpec: TableJsonSpec): string
{
  return `-- base query for table '${tableSpec.table}'`;
}

function lineCommentAggregatedRowObjects(tableSpec: TableJsonSpec): string
{
  return `-- aggregated row objects for table '${tableSpec.table}'`;
}

function lineCommentChildCollectionSelectExpression(childSpec: ChildSpec): string
{
  return `-- records from child table '${childSpec.tableJson.table}' as collection ` +
         `'${childSpec.collectionName}'`;
}

function lineCommentJoinToParent(parentSpec: ParentSpec): string
{
  return `-- parent table '${parentSpec.tableJson.table}', joined for inlined fields`;
}

function lineCommentInlineParentFieldsBegin(parentSpec: ParentSpec): string
{
  return `-- field(s) inlined from parent table '${parentSpec.tableJson.table}'`;
}

function lineCommentReferencedParent(parentSpec: ReferencedParentSpec): string
{
  return `-- parent table '${parentSpec.tableJson.table}' referenced as '${parentSpec.referenceName}'`;
}
