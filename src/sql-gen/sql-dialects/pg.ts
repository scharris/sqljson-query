import {Nullable} from '../../util/nullable';
import {indentLines} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {generalSqlKeywordsLowercase, SelectEntry} from "../sql-specs";

export class PostgresDialect implements SqlDialect
{
  readonly quotedStringRegex = /^".*"$/;
  readonly lowercaseNameRegex = /^[a-z_]+$/;

  constructor(readonly indentSpaces: number, jsonVariant: 'json' | 'jsonb' = 'jsonb') {}

  getRowObjectExpression
    (
      selectEntries: SelectEntry[],
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string
    )
    : string
  {
    const objectFieldDecls =
      selectEntries
      .map(se => `'${se.projectedName}', ${selectEntryValueSqlFn(se)}`)
      .join(',\n');

    return (
      'jsonb_build_object(\n' +
        indentLines(objectFieldDecls, this.indentSpaces) + '\n' +
      ')'
    );
  }

  getAggregatedRowObjectsExpression
    (
      selectEntries: SelectEntry[],
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string,
      orderBy: Nullable<string>
    )
    : string
  {
    return (
      'coalesce(jsonb_agg(' +
        this.getRowObjectExpression(selectEntries, selectEntryValueSqlFn) +
        (orderBy != null ? ` order by ${orderBy}` : '') +
      `),'[]'::jsonb)`
    );
  }

  getAggregatedColumnValuesExpression
    (
      valueExpression: string,
      orderBy: Nullable<string>
    )
    : string
  {
    return (
      `coalesce(jsonb_agg(${valueExpression}` +
        (orderBy != null ? ' order by ' + orderBy : '') +
      `),'[]'::jsonb)`
    );
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.lowercaseNameRegex.test(name) ||
         generalSqlKeywordsLowercase.has(name.toLowerCase()) )
      return `"${name}"`;
    return name;
  }

  quoteColumnNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.lowercaseNameRegex.test(name) ||
         avoidColumnNamesLowercase.has(name.toLowerCase()) )
      return `"${name}"`;
    return name;
  }
}

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const avoidColumnNamesLowercase = new Set([
  'all',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asymmetric',
  'authorization',
  'binary',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'collation',
  'column',
  'constraint',
  'create',
  'cross',
  'current_date',
  'current_role',
  'current_time',
  'current_timestamp',
  'current_user',
  'default',
  'deferrable',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'false',
  'fetch',
  'for',
  'foreign',
  'freeze',
  'from',
  'full',
  'grant',
  'group',
  'having',
  'ilike',
  'in',
  'initially',
  'inner',
  'intersect',
  'interval',
  'into',
  'is',
  'isnull',
  'join',
  'lateral',
  'leading',
  'left',
  'like',
  'limit',
  'localtime',
  'localtimestamp',
  'natural',
  'not',
  'notnull',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'outer',
  'overlaps',
  'placing',
  'primary',
  'references',
  'right',
  'select',
  'session_user',
  'similar',
  'some',
  'symmetric',
  'table',
  'tablesample',
  'then',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'user',
  'using',
  'verbose',
  'when',
  'where',
  'with'
]);
