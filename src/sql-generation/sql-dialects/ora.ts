import {Nullable} from '../../util/nullable';
import {indentLines} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {SelectEntry} from "../sql-specs";

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const sqlKeywordsLowercase = new Set([
  'select', 'from', 'where', 'user', 'order', 'group', 'by', 'over', 'is'
]);

export class OracleDialect implements SqlDialect
{
  readonly uppercaseNameRegex = /^[A-Z_]+$/;
  readonly quotedStringRegex = /^".*"$/;

  constructor(readonly indentSpaces: number) {}

  getRowObjectExpression
    (
      selectEntries: SelectEntry[],
      srcAlias: string
    )
    : string
  {
    const columnNames = selectEntries.map(e => e.projectedName);

    const objectFieldDecls =
      columnNames
      .map(colName => `'${colName}' value ${srcAlias}.${this.quoteColumnNameIfNeeded(colName)}`)
      .join(',\n');

    return (
      'json_object(\n' +
        indentLines(objectFieldDecls + '\nreturning clob', this.indentSpaces) + '\n' +
      ')'
    );
  }

  getAggregatedRowObjectsExpression
    (
      selectEntries: SelectEntry[],
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    return (
      'treat(coalesce(json_arrayagg(' +
        this.getRowObjectExpression(selectEntries, srcAlias) +
        (orderBy != null ? ' order by ' + orderBy.replace(/\$\$/g, srcAlias) : '') +
        ` returning clob), to_clob('[]')) as json)`
    );
  }

  getAggregatedColumnValuesExpression
    (
      selectEntry: SelectEntry,
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    const columnName = selectEntry.projectedName;

    return (
      `treat(coalesce(json_arrayagg(${srcAlias}.${this.quoteColumnNameIfNeeded(columnName)}` +
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : '') +
        ` returning clob), to_clob('[]')) as json)`
    );
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.uppercaseNameRegex.test(name) ||
         sqlKeywordsLowercase.has(name.toLowerCase()) )
      return `"${name}"`;
    return name;
  }

  quoteColumnNameIfNeeded(nameExact: string): string
  {
    if ( this.quotedStringRegex.test(nameExact) )
      return nameExact;
    if ( !simpleIdentifierRegex.test(nameExact) || !this.uppercaseNameRegex.test(nameExact) )
      return `"${nameExact}"`;
    return nameExact;
  }
}
