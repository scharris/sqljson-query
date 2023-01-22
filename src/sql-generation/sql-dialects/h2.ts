import { Nullable } from '../../util/nullable';
import { indentLines } from '../../util/strings';
import { SqlDialect } from './sql-dialect';

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const sqlKeywordsLowercase = new Set([
  'select', 'from', 'where', 'user', 'order', 'group', 'by', 'over', 'is'
]);

export class H2Dialect implements SqlDialect
{
  readonly uppercaseNameRegex = /^[A-Z_]+$/;
  readonly quotedStringRegex = /^".*"$/;

  constructor(readonly indentSpaces: number) {}

  getRowObjectExpression(columnNames: string[], srcAlias: string): string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${colName}' value ${srcAlias}.${this.quoteColumnNameIfNeeded(colName)}`)
      .join(',\n');

    return (
      'json_object(\n' +
        indentLines(objectFieldDecls, this.indentSpaces) + '\n' +
      ')'
    );
  }

  getAggregatedRowObjectsExpression
    (
      columnNames: string[],
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    return (
      'coalesce(json_arrayagg(' +
        this.getRowObjectExpression(columnNames, srcAlias) +
        (orderBy != null ? ' order by ' + orderBy.replace(/\$\$/g, srcAlias) : '') +
        `), '[]' format json)`
    );
  }

  getAggregatedColumnValuesExpression
    (
      columnName: string,
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    return (
      `coalesce(json_arrayagg(${srcAlias}.${this.quoteColumnNameIfNeeded(columnName)}` +
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : '') +
        `), '[]' format json)`
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
