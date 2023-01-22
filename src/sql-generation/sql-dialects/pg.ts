import { Nullable } from '../../util/nullable';
import { indentLines } from '../../util/strings';
import { SqlDialect } from './sql-dialect';

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const sqlKeywordsLowercase = new Set([
  'select', 'from', 'where', 'user', 'order', 'group', 'by', 'over', 'is'
]);

export class PostgresDialect implements SqlDialect
{
  readonly quotedStringRegex = /^".*"$/;
  readonly lowercaseNameRegex = /^[a-z_]+$/;

  constructor(readonly indentSpaces: number) {}

  getRowObjectExpression(columnNames: string[], srcAlias: string): string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${colName}', ${srcAlias}.${this.quoteColumnNameIfNeeded(colName)}`)
      .join(',\n');

    return (
      'jsonb_build_object(\n' +
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
      'coalesce(jsonb_agg(' +
        this.getRowObjectExpression(columnNames, srcAlias) +
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : '') +
      `),'[]'::jsonb)`
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
      `coalesce(jsonb_agg(${srcAlias}.${this.quoteColumnNameIfNeeded(columnName)}` +
        (orderBy != null ? ' order by ' + orderBy.replace(/\$\$/g, srcAlias) : '') +
      '))'
    );
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.lowercaseNameRegex.test(name) ||
         sqlKeywordsLowercase.has(name) )
      return `"${name}"`;
    return name;
  }

  quoteColumnNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) || !this.lowercaseNameRegex.test(name) )
      return `"${name}"`;
    return name;
  }
}