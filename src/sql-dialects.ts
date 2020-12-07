import {indentLines, unDoubleQuote} from './util/strings';
import {DatabaseMetadata} from './database-metadata';


type DbmsType = 'PG' | 'ORA' | 'ISO';

export interface SqlDialect
{
  getRowObjectExpression(colNames: string[], srcAlias: string): string;

  getAggregatedRowObjectsExpression(colNames: string[], orderBy: string | null | undefined, srcAlias: string): string;

  getAggregatedColumnValuesExpression(colName: string, orderBy: string | null | undefined, srcAlias: string): string;
}

export class PostgresDialect implements SqlDialect
{
  constructor(private indentSpaces: number) {}

  getRowObjectExpression(columnNames: string[], srcAlias: string): string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${unDoubleQuote(colName)}', ${srcAlias}.${colName}`)
      .join(",\n");

    return (
      "jsonb_build_object(\n" +
        indentLines(objectFieldDecls, this.indentSpaces) + "\n" +
      ")"
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
      "coalesce(jsonb_agg(" +
        this.getRowObjectExpression(columnNames, srcAlias) +
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : "") +
      "),'[]'::jsonb)"
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
        (orderBy != null ? " order by " + orderBy.replace(/\$\$/g, srcAlias) : "") +
      "))"
    );
  }
}

export class OracleDialect implements SqlDialect
{
  constructor(private indentSpaces: number) {}

  getRowObjectExpression(columnNames: string[], srcAlias: string): string
  {
    const objectFieldDecls =
      columnNames
      .map(colName => `'${unDoubleQuote(colName)}' value ${srcAlias}.${colName}`)
      .join(",\n");

    return (
      "json_object(\n" +
        indentLines(objectFieldDecls, this.indentSpaces) + " returning clob\n" +
      ")"
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
      "treat(coalesce(json_arrayagg(" +
        this.getRowObjectExpression(columnNames, srcAlias) +
        (orderBy != null ? " order by " + orderBy.replace(/\$\$/g, srcAlias) : "") +
        " returning clob" +
      "), to_clob('[]')) as json)"
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
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : "") +
        " returning clob" +
      "), to_clob('[]')) as json)"
    );
  }
}

export function getSqlDialect(dbmd: DatabaseMetadata, indentSpaces: number): SqlDialect
{
  const dbmsType: DbmsType = getDbmsType(dbmd.dbmsName);
  switch ( dbmsType )
  {
    case 'PG': return new PostgresDialect(indentSpaces);
    case 'ORA': return new OracleDialect(indentSpaces);
    default: throw new Error(`dbms type ${dbmsType} is currently not supported`);
  }
}

function getDbmsType(dbmsName: string): DbmsType
{
  const dbmsLower = dbmsName.toLowerCase();
  if ( dbmsLower.startsWith("postgres") ) return 'PG';
  else if ( dbmsLower.startsWith("oracle") ) return 'ORA';
  else return 'ISO';
}
