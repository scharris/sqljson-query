import { indentLines, Nullable, unDoubleQuote } from '../util/mod';
import { DatabaseMetadata } from '../dbmd';

type DbmsType = 'PG' | 'ORA' | 'MYSQL' | 'ISO';

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const sqlKeywordsLowercase = new Set([
  'select', 'from', 'where', 'user', 'order', 'group', 'by', 'over'
]);

export interface SqlDialect
{
  getRowObjectExpression(colNames: string[], srcAlias: string): string;

  getAggregatedRowObjectsExpression(colNames: string[], orderBy: Nullable<string>, srcAlias: string): string;

  getAggregatedColumnValuesExpression(colName: string, orderBy: Nullable<string>, srcAlias: string): string;

  quoteObjectNameIfNeeded(name: string): string;

  quoteColumnNameIfNeeded(name: string): string;

  indentSpaces: number;
}

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

export class OracleDialect implements SqlDialect
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
        indentLines(objectFieldDecls + '\nreturning clob', this.indentSpaces) + '\n' +
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
      'treat(coalesce(json_arrayagg(' +
        this.getRowObjectExpression(columnNames, srcAlias) +
        (orderBy != null ? ' order by ' + orderBy.replace(/\$\$/g, srcAlias) : '') +
        ` returning clob), to_clob('[]')) as json)`
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

export class MySQLDialect implements SqlDialect
{
  readonly backtickQuotedStringRegex = /^`.*`$/;
  readonly doubleQuotedStringRegex = /^".*"$/;

  constructor(readonly indentSpaces: number) {}

  getRowObjectExpression
    (
      columnNames: string[],
      srcAlias: string
    )
    : string
  {
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
      columnNames: string[],
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    if (orderBy != null )
      throw new Error(`MySQL dialect does not support ordering in aggregate functions currently.`);

    return (
      'cast(coalesce(json_arrayagg(' +
        this.getRowObjectExpression(columnNames, srcAlias) +
      `), json_type('[]')) as json)`
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

export function getSqlDialect(dbmd: DatabaseMetadata, indentSpaces: number): SqlDialect
{
  const dbmsType: DbmsType = getDbmsType(dbmd.dbmsName);
  switch ( dbmsType )
  {
    case 'PG': return new PostgresDialect(indentSpaces);
    case 'ORA': return new OracleDialect(indentSpaces);
    case 'MYSQL': return new MySQLDialect(indentSpaces);
    default: throw new Error(`dbms type ${dbmsType} is currently not supported`);
  }
}

function getDbmsType(dbmsName: string): DbmsType
{
  const dbmsLower = dbmsName.toLowerCase();
  if ( dbmsLower.startsWith('postgres') ) return 'PG';
  else if ( dbmsLower.startsWith('oracle') ) return 'ORA';
  else if (dbmsLower === 'mysql') return 'MYSQL';
  else return 'ISO';
}
