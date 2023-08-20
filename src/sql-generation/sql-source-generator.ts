import {indentLines, replaceAll} from "../util/strings";
import {mapSet, nonEmpty, sorted} from "../util/collections";
import {exactUnquotedName} from "../util/database-names";
import {CaseSensitivity, RelId} from "../dbmd";
import {FromEntry, getPropertySelectEntries, ParentChildCondition, SelectEntry, SqlSpec, WhereEntry} from "./sql-specs";
import {SqlDialect} from "./sql-dialects";

export class SqlSourceGenerator
{
  private readonly unqualNameSchemas: Set<string>; // Use unqualified table names in these schemas.

  constructor
    (
      private readonly sqlDialect: SqlDialect,
      private readonly caseSensitivity: CaseSensitivity,
      unqualNameSchemas: Set<string>,
      private readonly genComments = true,
    )
  {
    this.unqualNameSchemas = mapSet(unqualNameSchemas, s => exactUnquotedName(s, this.caseSensitivity));
  }

  makeSql(spec: SqlSpec): string
  {
    const propSelEntries = getPropertySelectEntries(spec);
    const objWrap = spec.objectWrapProperties ?? false;
    const arrayAgg = spec.aggregateToArray ?? false;
    const addSelEntries = spec.additionalOutputSelectEntries ?? [];
    const selectComment = this.genComments && spec.selectEntriesLeadingComment ?
      `-- ${spec.selectEntriesLeadingComment}\n` : '';

    const selEntryValFn = (se: SelectEntry) => this.selectEntrySql(se, true);

    const selectEntries =
      arrayAgg ?
        (objWrap
          ? this.sqlDialect.getAggregatedRowObjectsExpression(propSelEntries, selEntryValFn, spec.aggregateOrderBy)
          : this.sqlDialect.getAggregatedColumnValuesExpression(this.selectEntrySql(propSelEntries[0], true), spec.aggregateOrderBy))+' json\n'
      : objWrap ?
          this.sqlDialect.getRowObjectExpression(propSelEntries, selEntryValFn)+' json' +
          (nonEmpty(addSelEntries)
            ? `,\n${addSelEntries.map(c => this.selectEntrySql(c)).join(',\n')}`
            : ''
          ) + "\n"
      : this.selectEntriesSql(spec.selectEntries) + "\n";

    const fromComment = this.genComments && spec.fromEntriesLeadingComment ?
      `-- ${spec.fromEntriesLeadingComment}\n` : '';

    const fromEntries = spec.fromEntries.map(e => this.fromEntrySql(e)).join('\n') + '\n';

    const whereClause = nonEmpty(spec.whereEntries) ?
      `where (\n${this.indent(spec.whereEntries.map(e => this.whereEntrySql(e)).join(' and\n'))}\n)\n`
      : '';

    const orderByClause = spec.orderBy ?
      'order by ' + spec.orderBy.orderBy.replace(/\$\$/g, spec.orderBy.tableAlias) + '\n'
      : '';

    return (
      'select\n' + this.indent(selectComment + selectEntries) +
      'from\n' + this.indent(fromComment + fromEntries) +
      whereClause +
      orderByClause
    );
  }

  private selectEntriesSql(specSelectEntries: SelectEntry[]): string
  {
    // Assign any missing displayOrders based on select entry position.
    const selectEntries: SelectEntry[] =
      specSelectEntries.map((entry, ix) => ({
        ...entry,
        displayOrder: entry.displayOrder ?? ix + 1
      }));

    const sortedSelectEntries =
      sorted(
        selectEntries,
        (e1, e2) => (e1.displayOrder ?? 0) - (e2.displayOrder ?? 0)
      );

    return sortedSelectEntries.map(se =>
      (this.genComments && se.comment ? `-- ${se.comment}\n` : '') +
      this.selectEntrySql(se)).join(',\n'
    );
  }

  private selectEntrySql(selectEntry: SelectEntry, valueOnly = false): string
  {
    switch (selectEntry.entryType)
    {
      case 'se-field':
      {
        const fieldName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.field.name);

        const valueSql = `${selectEntry.tableAlias}.${fieldName}`;
        if (valueOnly)
          return valueSql;

        const projectedName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.projectedName);
        const isProjectedNameQuoted = projectedName !== selectEntry.projectedName;
        const sep = isProjectedNameQuoted ? ' ' : ' as ';

        return `${valueSql}${sep}${projectedName}`;
      }
      case 'se-hidden-pkf':
      {
        const fieldName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.pkFieldName);

        const valueSql = `${selectEntry.tableAlias}.${fieldName}`;
        if (valueOnly)
          return valueSql;

        const isFieldNameQuoted = fieldName !== selectEntry.pkFieldName;
        const sep = isFieldNameQuoted ? ' ' : ' as ';
        const exportedName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.projectedName);
        return `${valueSql}${sep}${exportedName}`;
      }
      case 'se-expr':
      {
        const tableAliasPlaceholder = selectEntry.tableAliasPlaceholderInExpr || DEFAULT_ALIAS_PLACEHOLDER;
        const expr = replaceAll(selectEntry.expression, tableAliasPlaceholder, selectEntry.tableAlias);
        if (valueOnly)
          return expr;

        const projectedName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.projectedName);
        const isProjectedNameQuoted = projectedName !== selectEntry.projectedName;
        const sep = isProjectedNameQuoted ? ' ' : ' as ';

        return `${expr}${sep}${projectedName}`;
      }
      case 'se-inline-parent-prop':
      {
        const projectedName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.projectedName);
        return `${selectEntry.parentAlias}.${projectedName}`;
      }
      case 'se-parent-ref':
      {
        const parentRowObjSql = this.makeSql(selectEntry.parentRowObjectSql);

        const valueSql = '(\n'+this.indent(parentRowObjSql)+')';
        if (valueOnly)
          return valueSql;

        const projectedName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.projectedName);

        return `${valueSql} ${projectedName}`;
      }
      case 'se-child-coll':
      {
        const collectionSql = this.makeSql(selectEntry.collectionSql);

        const valueSql = '(\n'+this.indent(collectionSql)+')';
        if (valueOnly)
          return valueSql;

        const projectedName = this.sqlDialect.quoteColumnNameIfNeeded(selectEntry.projectedName);

        return `${valueSql} ${projectedName}`;
      }
    }
  }

  private fromEntrySql(fromEntry: FromEntry): string
  {
    const commentLine = this.genComments && fromEntry.comment ? `-- ${fromEntry.comment}\n` : '';
    const joinParts = fromEntry.join
      ? { joinType: fromEntry.join.joinType === 'INNER' ? 'join' : 'left join',
          onCond: this.parentChildConditionSql(fromEntry.join.parentChildCondition) }
      : null;

    switch (fromEntry.entryType)
    {
      case 'table':
      {
        const table = this.minimalRelIdentifier(fromEntry.table);
        return commentLine + (
          joinParts
            ? `${joinParts.joinType} ${table} ${fromEntry.alias} on ${joinParts.onCond}`
            : `${table} ${fromEntry.alias}`
        );
      }
      case 'query':
      {
        const querySql = this.indent(this.makeSql(fromEntry.query));
        return commentLine + (
          joinParts
            ? `${joinParts.joinType} (\n${querySql}) ${fromEntry.alias} on ${joinParts.onCond}`
            : `(\n${querySql}) ${fromEntry.alias}`
        );
      }
    }
  }

  private whereEntrySql(whereEntry: WhereEntry): string
  {
    if (whereEntry.condType === 'general')
    {
      const tableAliasPlaceholder = whereEntry.tableAliasPlaceholderInCondSql || DEFAULT_ALIAS_PLACEHOLDER;
      return `(${replaceAll(whereEntry.condSql, tableAliasPlaceholder, whereEntry.tableAlias)})`;
    }
    else
      return this.parentChildConditionSql(whereEntry);
  }

  parentChildConditionSql(pcCond: ParentChildCondition): string
  {
    const [parentAlias, childAlias] = pcCond.condType === 'pcc-on-pk'
      ? [pcCond.fromAlias, pcCond.childAlias]
      : [pcCond.parentAlias, pcCond.fromAlias];

    return pcCond.matchedFields.map(mf =>
      `${childAlias}.${this.sqlDialect.quoteColumnNameIfNeeded(mf.foreignKeyFieldName)}` +
      ' = ' +
      `${parentAlias}.${this.sqlDialect.quoteColumnNameIfNeeded(mf.primaryKeyFieldName)}`
    ).join(' and ');
  }

  private minimalRelIdentifier(relId: RelId): string
  {
    const unquotedSchema = relId.schema && !this.unqualNameSchemas.has(relId.schema) ? relId.schema : null;
    const schema = unquotedSchema ? this.sqlDialect.quoteObjectNameIfNeeded(unquotedSchema) : null;
    const relName = this.sqlDialect.quoteObjectNameIfNeeded(relId.name);
    return schema != null ? `${schema}.${relName}` : relName;
  }

  private indent(s: string): string
  {
    return indentLines(s, this.sqlDialect.indentSpaces, true);
  }
}

const DEFAULT_ALIAS_PLACEHOLDER = '$$';
