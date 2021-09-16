import {indentLines, unDoubleQuote} from './util/mod';
import {DatabaseMetadata} from './database-metadata';

type DbmsType = 'PG' | 'ORA' | 'MYSQL' | 'ISO';

export interface SqlDialect
{
  getRowObjectExpression(colNames: string[], srcAlias: string): string;

  getAggregatedRowObjectsExpression(colNames: string[], orderBy: string | null | undefined, srcAlias: string): string;

  getAggregatedColumnValuesExpression(colName: string, orderBy: string | null | undefined, srcAlias: string): string;

  quoteNameIfNeeded(name: string): string;
}

export class PostgresDialect implements SqlDialect
{
  readonly quotedStringRegex = /^".*"$/;
  readonly lowercaseNameRegex = /^[a-z_]+$/;

  constructor(private indentSpaces: number) {}

  getRowObjectExpression(columnNames: string[], srcAlias: string): string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${unDoubleQuote(colName)}', ${srcAlias}.${colName}`)
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
      orderBy: string | null | undefined,
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
      orderBy: string | null | undefined,
      srcAlias: string
    )
    : string
  {
    return (
      `coalesce(jsonb_agg(${srcAlias}.${columnName}` +
        (orderBy != null ? ' order by ' + orderBy.replace(/\$\$/g, srcAlias) : '') +
      '))'
    );
  }

  quoteNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( name.charAt(0) === '_' )
      return `"${name}"`;
    if ( this.lowercaseNameRegex.test(name) )
      return name;
    return `"${name}"`;
  }
}

export class OracleDialect implements SqlDialect
{
  readonly uppercaseNameRegex = /^[A-Z_]+$/;
  readonly quotedStringRegex = /^".*"$/;

  constructor(private indentSpaces: number) {}

  getRowObjectExpression(columnNames: string[], srcAlias: string): string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${unDoubleQuote(colName)}' value ${srcAlias}.${colName}`)
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
      orderBy: string | null | undefined,
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
      orderBy: string | null | undefined,
      srcAlias: string
    )
    : string
  {
    return (
      `treat(coalesce(json_arrayagg(${srcAlias}.${columnName}` +
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : '') +
        ` returning clob), to_clob('[]')) as json)`
    );
  }

  quoteNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( name.charAt(0) === '_' )
      return `"${name}"`;
    if ( this.uppercaseNameRegex.test(name) )
      return name;
    return `"${name}"`;
  }
}

export class MySQLDialect implements SqlDialect
{
  readonly simpleNameRegex = /^[A-Za-z_][A-Za-z_0-9]+$/;
  readonly backtickQuotedStringRegex = /^`.*`$/;
  readonly doubleQuotedStringRegex = /^".*"$/;

  constructor(private indentSpaces: number) {}

  getRowObjectExpression
    (
      columnNames: string[],
      srcAlias: string
    )
    : string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${unDoubleQuote(colName)}', ${srcAlias}.${colName}`)
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
      orderBy: string | null | undefined,
      srcAlias: string
    )
    : string
  {
    if ( orderBy != null  )
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
      orderBy: string | null | undefined,
      srcAlias: string
    )
    : string
  {
    if ( orderBy != null  )
      throw new Error(`Error for column ${columnName}: MySQL dialect does not support ordering in aggregate functions currently.`);

    return (
      `cast(coalesce(json_arrayagg(${srcAlias}.${columnName}), json_type('[]')) as json)`
    );
  }

  quoteNameIfNeeded(name: string): string
  {
    if ( this.doubleQuotedStringRegex.test(name) )
      return `\`${unDoubleQuote(name)}\``;
    if ( this.backtickQuotedStringRegex.test(name) || this.simpleNameRegex.test(name) )
      return name;
    return `\`${name}\``;
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
  else if ( dbmsLower === 'mysql' ) return 'MYSQL';
  else return 'ISO';
}
