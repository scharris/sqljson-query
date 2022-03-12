import { indentLines, replaceAll } from "../util/strings";
import { mapSet, nonEmpty } from "../util/collections";
import { exactUnquotedName } from "../util/database-names";
import { CaseSensitivity, RelId } from "../dbmd";
import { FromEntry, HiddenPrimaryKeySelectEntry, OrderBy, ParentChildCondition, PropertySelectEntry, SqlSpec, WhereEntry }
  from "./sql-specs";
import { SqlDialect } from "./sql-dialects";

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
    const baseSql = this.baseSql(spec);

    const wrapPropsInObj = spec.wrapPropertiesInJsonObject ?? false;

    if (!spec.aggregateToArray && !wrapPropsInObj) // no aggregation nor object wrapping
    {
      return baseSql;
    }
    else // at least one of aggregation and object wrapping of properties will be done
    {
      const propertyNames = spec.propertySelectEntries.map(se => se.projectedName);
      const baseTable = baseTableDescn(spec); // only used for comments

      if (!spec.aggregateToArray) // no aggregation but do object wrapping
      {
        return this.jsonRowObjectsSql(baseSql, propertyNames, spec.orderBy, baseTable);
      }
      else // aggregation and maybe object wrapping
      {
        return this.aggregateSql(baseSql, propertyNames, wrapPropsInObj, spec.orderBy, baseTable);
      }
    }
  }

  private baseSql(spec: SqlSpec)
  {
    const selectComment = this.genComments && spec.selectEntriesLeadingComment ?
      `-- ${spec.selectEntriesLeadingComment}\n` : '';
    const hiddenPkFields = nonEmpty(spec.hiddenPrimaryKeySelectEntries)
      ? spec.hiddenPrimaryKeySelectEntries.map(e => this.hiddenPkSelectEntrySql(e)).join(',\n') + ',\n'
      : '';
    const properties = spec.propertySelectEntries.map(e => this.selectEntrySql(e)).join(',\n') + '\n';
    const fromComment = this.genComments && spec.fromEntriesLeadingComment ?
      `-- ${spec.fromEntriesLeadingComment}\n` : '';
    const fromEntries = spec.fromEntries.map(e => this.fromEntrySql(e)).join('\n') + '\n';
    const whereClause = nonEmpty(spec.whereEntries)
      ? `where (\n${this.indent(spec.whereEntries.map(e => this.whereEntrySql(e)).join(' and\n'))}\n)\n`
      : '';
    const orderByClause = spec.orderBy
      ? 'order by ' + spec.orderBy.orderBy.replace(/\$\$/g, spec.orderBy.tableAlias) + '\n'
      : '';

    return (
      'select\n' + this.indent(selectComment + hiddenPkFields + properties) +
      'from\n' + this.indent(fromComment + fromEntries) +
      whereClause +
      orderByClause
    );
  }

  private jsonRowObjectsSql
    (
      baseSql: string,
      propertyNames: string[],
      orderBy: OrderBy | null | undefined,
      baseTableDesc: string | null, // for comments
    )
    : string
  {
    return (
      'select\n' +
        this.indent(
          (baseTableDesc ? `-- row object for table ${baseTableDesc}\n` : '') +
          this.sqlDialect.getRowObjectExpression(propertyNames, 'q') + ' json'
        ) + '\n' +
      'from (\n' +
        nlterm(this.indent(
          (baseTableDesc ? `-- base query for table ${baseTableDesc}\n` : '') +
          baseSql
        )) +
      ') q' +
      (orderBy != null ? '\norder by ' + orderBy.orderBy.replace(/\$\$/g, 'q') : '')
    );
  }

  private aggregateSql
    (
      sql: string,
      propertyNames: string[],
      wrapPropertiesInJsonObject: boolean,
      orderBy: OrderBy | null | undefined,
      baseTableDesc: string | null, // for comments
    )
    : string
  {
    const ordby = orderBy?.orderBy;
    return (
      'select\n' +
        this.indent(
          (this.genComments ? `-- aggregated values for table ${baseTableDesc}\n` : '') +
          (wrapPropertiesInJsonObject
            ? this.sqlDialect.getAggregatedRowObjectsExpression(propertyNames, ordby, 'q')
            : this.sqlDialect.getAggregatedColumnValuesExpression(propertyNames[0], ordby, 'q')) + ' json\n'
        ) +
      'from (\n' +
        nlterm(this.indent(
          (this.genComments ? `-- base query for table ${baseTableDesc}\n` : '') +
          sql
        )) +
      ') q'
    );
  }

  private selectEntrySql(selectEntry: PropertySelectEntry): string
  {
    const projectedName = this.maybeQuoteColumn(selectEntry.projectedName);
    const isProjectedNameQuoted = projectedName !== selectEntry.projectedName;

    switch (selectEntry.entryType)
    {
      case 'field':
      {
        const fieldName = this.maybeQuoteColumn(selectEntry.fieldName);
        const sep = isProjectedNameQuoted ? ' ' : ' as ';

        return `${selectEntry.tableAlias}.${fieldName}${sep}${projectedName}`;
      }
      case 'expr':
      {
        const tableAliasPlaceholder = selectEntry.tableAliasPlaceholderInExpr || DEFAULT_TABLE_ALIAS_PLACEHOLDER;
        const expr = replaceAll(selectEntry.expression, tableAliasPlaceholder, selectEntry.tableAlias);
        const sep = isProjectedNameQuoted ? ' ' : ' as ';

        return `${expr}${sep}${projectedName}`;
      }
      case 'inline-parent-prop':
      {
        return (this.genComments && selectEntry.comment ? `-- ${selectEntry.comment}\n` : '') +
          `${selectEntry.parentAlias}.${projectedName}`;
      }
      case 'parent-ref':
      {
        const parentRowObjSql = this.makeSql(selectEntry.parentRowObjectSql);

        return (this.genComments && selectEntry.comment ? `-- ${selectEntry.comment}\n` : '') +
          '(\n' +
            this.indent(parentRowObjSql) + '\n' +
          `) ${projectedName}`;
      }
      case 'child-coll':
      {
        const collectionSql = this.makeSql(selectEntry.collectionSql);

        return (this.genComments && selectEntry.comment ? `-- ${selectEntry.comment}\n` : '') +
          '(\n' +
            this.indent(collectionSql) + '\n' +
          `) ${projectedName}`;
      }
    }
  }

  private hiddenPkSelectEntrySql(pkEntry: HiddenPrimaryKeySelectEntry): string
  {
      const fieldName = this.maybeQuoteColumn(pkEntry.pkFieldName);
      const isFieldNameQuoted = fieldName !== pkEntry.pkFieldName;
      const sep = isFieldNameQuoted ? ' ' : ' as ';
      const exportedName = this.maybeQuoteColumn(pkEntry.projectedName);
      return `${pkEntry.tableAlias}.${fieldName}${sep}${exportedName}`;
  }

  private fromEntrySql(fromEntry: FromEntry): string
  {
    const commentLine = this.genComments && fromEntry.comment ? `-- ${fromEntry.comment}\n` : '';
    const joinParts = fromEntry.joinCondition
      ? { joinType: fromEntry.joinCondition.joinType === 'INNER' ? 'join' : 'left join',
          onCond: this.parentChildConditionSql(fromEntry.joinCondition.parentChildCondition) }
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
    if (whereEntry.condType === 'gen')
    {
      const tableAliasPlaceholder = whereEntry.tableAliasPlaceholderInCondSql || DEFAULT_TABLE_ALIAS_PLACEHOLDER;
      return `(${replaceAll(whereEntry.condSql, tableAliasPlaceholder, whereEntry.tableAlias)})`;
    }
    else
      return this.parentChildConditionSql(whereEntry);
  }

  parentChildConditionSql(pcCond: ParentChildCondition): string
  {
    const [parentAlias, childAlias] = pcCond.condType === 'pk'
      ? [pcCond.fromAlias, pcCond.childAlias]
      : [pcCond.parentAlias, pcCond.fromAlias];

    return pcCond.matchedFields.map(mf =>
      `${childAlias}.${this.maybeQuoteColumn(mf.foreignKeyFieldName)}` +
      ' = ' +
      `${parentAlias}.${this.maybeQuoteColumn(mf.primaryKeyFieldName)}`
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

  private maybeQuoteColumn(colName: string)
  {
    return this.sqlDialect.quoteColumnNameIfNeeded(colName);
  }
}

function baseTableDescn(sqlSpec: SqlSpec): string | null
{
  const firstFromEntry = sqlSpec.fromEntries[0];
  if (firstFromEntry.entryType === 'table') return firstFromEntry.table.name;
  return null;
}

// Newline terminate the given string if it doesn't end with a newline.
function nlterm(s: string): string
{
  return !s.endsWith('\n') ? s + '\n' : s;
}

const DEFAULT_TABLE_ALIAS_PLACEHOLDER = '$$';
