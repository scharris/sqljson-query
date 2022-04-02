import { indentLines, replaceAll } from "../util/strings";
import { mapSet, isNonEmpty, sorted } from "../util/collections";
import { exactUnquotedName } from "../util/database-names";
import { CaseSensitivity, RelId } from "../dbmd";
import { FromEntry, getPropertySelectEntries, OrderBy, ParentChildCondition, SelectEntry, SqlSpec, WhereEntry }
  from "./sql-specs";
import { SqlDialect } from "./sql-dialects";
import { AdditionalObjectPropertyColumn } from "../query-specs";
import { Nullable } from "../util/mod";

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

    const wrapPropsInObj = spec.objectWrapProperties ?? false;

    if (!spec.aggregateToArray && !wrapPropsInObj) // no aggregation nor object wrapping
    {
      return baseSql;
    }
    else // at least one of aggregation and object wrapping of properties will be done
    {
      const propertyNames = getPropertySelectEntries(spec).map(e => e.projectedName);
      const baseTable = baseTableDescn(spec); // only used for comments

      if (!spec.aggregateToArray) // no aggregation but do object wrapping
      {
        const additionalCols = spec.additionalObjectPropertyColumns ?? [];
        return this.jsonRowObjectsSql(baseSql, propertyNames, additionalCols, spec.orderBy, baseTable);
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
    const selectEntries = this.makeSelectEntriesSql(spec.selectEntries) + '\n';
    const fromComment = this.genComments && spec.fromEntriesLeadingComment ?
      `-- ${spec.fromEntriesLeadingComment}\n` : '';
    const fromEntries = spec.fromEntries.map(e => this.fromEntrySql(e)).join('\n') + '\n';
    const whereClause = isNonEmpty(spec.whereEntries)
      ? `where (\n${this.indent(spec.whereEntries.map(e => this.whereEntrySql(e)).join(' and\n'))}\n)\n`
      : '';
    const orderByClause = spec.orderBy
      ? 'order by ' + spec.orderBy.orderBy.replace(/\$\$/g, spec.orderBy.tableAlias) + '\n'
      : '';

    return (
      'select\n' + this.indent(selectComment + selectEntries) +
      'from\n' + this.indent(fromComment + fromEntries) +
      whereClause +
      orderByClause
    );
  }

  private makeSelectEntriesSql(specSelectEntries: SelectEntry[]): string
  {
    // Assign any missing displayOrders based on select entry position.
    const selectEntries: SelectEntry[] =
      specSelectEntries.map((entry, ix) => ({
        ...entry,
        dislayOrder: entry.displayOrder ?? ix + 1
      }));

    const sortedSelectEntries = sorted(selectEntries, (e1, e2) => (e1.displayOrder ?? 0) - (e2.displayOrder ?? 0));

    return sortedSelectEntries.map(e => this.selectEntrySql(e)).join(',\n');
  }

  private jsonRowObjectsSql
    (
      baseSql: string,
      propertyNames: string[],
      additionalColumns: AdditionalObjectPropertyColumn[],
      orderBy: Nullable<OrderBy>,
      baseTableDesc: Nullable<string>, // for comments
    )
    : string
  {
    return (
      'select\n' +
        this.indent(
          (baseTableDesc ? `-- row object for table '${baseTableDesc}'\n` : '') +
          this.sqlDialect.getRowObjectExpression(propertyNames, 'q') + ' json' +
          (isNonEmpty(additionalColumns)
            ? `,\n${additionalColumns.map(c => this.additionalPropertyColumnSql(c)).join(',\n')}`
            : '')
        ) + '\n' +
      'from (\n' +
        nlterm(this.indent(
          (baseTableDesc ? `-- base query for table '${baseTableDesc}'\n` : '') +
          baseSql
        )) +
      ') q' +
      (orderBy != null ? '\norder by ' + orderBy.orderBy.replace(/\$\$/g, 'q') : '')
    );
  }

  private additionalPropertyColumnSql(c: AdditionalObjectPropertyColumn): string
  {
    if (typeof(c) === 'string')
      return this.sqlDialect.quoteColumnNameIfNeeded(c);

    const propNameExpr = this.sqlDialect.quoteColumnNameIfNeeded(c.property);
    const alias = this.sqlDialect.quoteColumnNameIfNeeded(c.as);
    return `${propNameExpr} as ${alias}`;
  }


  private aggregateSql
    (
      sql: string,
      propertyNames: string[],
      wrapProps: boolean,
      orderBy: Nullable<OrderBy>,
      baseTableDesc: Nullable<string>, // for comments
    )
    : string
  {
    const ordby = orderBy?.orderBy;
    return (
      'select\n' +
        this.indent(
          (this.genComments ? `-- aggregated ${wrapProps? 'rows' : 'values'} from table '${baseTableDesc}'\n`: '') +
          (wrapProps
            ? this.sqlDialect.getAggregatedRowObjectsExpression(propertyNames, ordby, 'q')
            : this.sqlDialect.getAggregatedColumnValuesExpression(propertyNames[0], ordby, 'q')) + ' json\n'
        ) +
      'from (\n' +
        nlterm(this.indent(
          (this.genComments ? `-- base query for table '${baseTableDesc}'\n` : '') +
          sql
        )) +
      ') q'
    );
  }

  private selectEntrySql(selectEntry: SelectEntry): string
  {
    const projectedName = this.maybeQuoteColumn(selectEntry.projectedName);
    const isProjectedNameQuoted = projectedName !== selectEntry.projectedName;

    switch (selectEntry.entryType)
    {
      case 'se-field':
      {
        const fieldName = this.maybeQuoteColumn(selectEntry.field.name);
        const sep = isProjectedNameQuoted ? ' ' : ' as ';

        return `${selectEntry.tableAlias}.${fieldName}${sep}${projectedName}`;
      }
      case 'se-expr':
      {
        const tableAliasPlaceholder = selectEntry.tableAliasPlaceholderInExpr || DEFAULT_ALIAS_PLACEHOLDER;
        const expr = replaceAll(selectEntry.expression, tableAliasPlaceholder, selectEntry.tableAlias);
        const sep = isProjectedNameQuoted ? ' ' : ' as ';

        return `${expr}${sep}${projectedName}`;
      }
      case 'se-inline-parent-prop':
      {
        return (this.genComments && selectEntry.comment ? `-- ${selectEntry.comment}\n` : '') +
          `${selectEntry.parentAlias}.${projectedName}`;
      }
      case 'se-parent-ref':
      {
        const parentRowObjSql = this.makeSql(selectEntry.parentRowObjectSql);

        return (this.genComments && selectEntry.comment ? `-- ${selectEntry.comment}\n` : '') +
          '(\n' +
            this.indent(parentRowObjSql) + '\n' +
          `) ${projectedName}`;
      }
      case 'se-child-coll':
      {
        const collectionSql = this.makeSql(selectEntry.collectionSql);

        return (this.genComments && selectEntry.comment ? `-- ${selectEntry.comment}\n` : '') +
          '(\n' +
            this.indent(collectionSql) + '\n' +
          `) ${projectedName}`;
      }
      case 'se-hidden-pkf':
      {
        const fieldName = this.maybeQuoteColumn(selectEntry.pkFieldName);
        const isFieldNameQuoted = fieldName !== selectEntry.pkFieldName;
        const sep = isFieldNameQuoted ? ' ' : ' as ';
        const exportedName = this.maybeQuoteColumn(selectEntry.projectedName);
        return `${selectEntry.tableAlias}.${fieldName}${sep}${exportedName}`;
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

const DEFAULT_ALIAS_PLACEHOLDER = '$$';
