import {Nullable} from '../../util/nullable';
import {indentLines, unDoubleQuote} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {SelectEntry} from "../sql-specs";

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const sqlKeywordsLowercase = new Set([
  'select', 'from', 'where', 'user', 'order', 'group', 'by', 'over', 'is'
]);

export class MySQLDialect implements SqlDialect
{
  readonly backtickQuotedStringRegex = /^`.*`$/;
  readonly doubleQuotedStringRegex = /^".*"$/;

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
      .map(colName => `'${colName}', ${srcAlias}.${this.quoteColumnNameIfNeeded(colName)}`)
      .join(',\n');

    return (
      'json_object(\n' +
        indentLines(objectFieldDecls, this.indentSpaces) + '\n' +
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
    if (orderBy != null )
      throw new Error(`MySQL dialect does not support ordering in aggregate functions currently.`);

    return (
      'cast(coalesce(json_arrayagg(' +
        this.getRowObjectExpression(selectEntries, srcAlias) +
      `), json_type('[]')) as json)`
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

    if (orderBy != null )
      throw new Error(`Error for column ${columnName}: MySQL dialect does not support ordering in aggregate functions currently.`);

    return (
      `cast(coalesce(json_arrayagg(${srcAlias}.${this.quoteColumnNameIfNeeded(columnName)}), json_type('[]')) as json)`
    );
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.backtickQuotedStringRegex.test(name) )
      return name;
    if ( this.doubleQuotedStringRegex.test(name) )
      return `\`${unDoubleQuote(name)}\``;
    if ( !simpleIdentifierRegex.test(name) || sqlKeywordsLowercase.has(name.toLowerCase()) )
      return `\`${name}\``;
    return name;
  }

  quoteColumnNameIfNeeded(name: string): string
  {
    if ( this.backtickQuotedStringRegex.test(name) )
      return name;
    if ( this.doubleQuotedStringRegex.test(name) )
      return `\`${unDoubleQuote(name)}\``;
    if ( !simpleIdentifierRegex.test(name) )
      return `\`${name}\``;
    return name;
  }
}
