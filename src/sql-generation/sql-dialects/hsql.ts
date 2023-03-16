import {Nullable} from '../../util/nullable';
import {indentLines} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {generalSqlKeywordsLowercase, SelectEntry} from "../sql-specs";

export class HSQLDialect implements SqlDialect
{
  readonly uppercaseNameRegex = /^[A-Z_]+$/;
  readonly quotedStringRegex = /^".*"$/;

  constructor(readonly indentSpaces: number) {}

  getRowObjectExpression
    (
      selectEntries: SelectEntry[],
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string
    )
    : string
  {
    const objectFieldDecls =
      selectEntries
      .map(se=> `'${se.projectedName}' value ${selectEntryValueSqlFn(se)}` +
        (needsFormatJson(se) ? " format json" : "")
      )
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
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string,
      orderBy: Nullable<string>
    )
    : string
  {
    return (
      'coalesce(json_arrayagg(' +
        this.getRowObjectExpression(selectEntries, selectEntryValueSqlFn) +
        (orderBy != null ? ` order by ${orderBy}` : '') +
      `), '[]')`
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
      '))'
    );
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.uppercaseNameRegex.test(name) ||
         generalSqlKeywordsLowercase.has(name.toLowerCase()) )
      return `"${name}"`;
    return name;
  }

  quoteColumnNameIfNeeded(nameExact: string): string
  {
    if ( this.quotedStringRegex.test(nameExact) )
      return nameExact;
    if ( !simpleIdentifierRegex.test(nameExact) ||
         !this.uppercaseNameRegex.test(nameExact) ||
         avoidColumnNamesLowercase.has(nameExact.toLowerCase()) )
      return `"${nameExact}"`;
    return nameExact;
  }
}

function needsFormatJson(selectEntry: SelectEntry): boolean
{
  switch (selectEntry.entryType)
  {
    case "se-parent-ref":
    case "se-child-coll":
      return true;
    case "se-field":
    case "se-expr":
    case "se-hidden-pkf":
      return false;
    case "se-inline-parent-prop":
      return needsFormatJson(selectEntry.parentSelectEntry);
  }
}

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const avoidColumnNamesLowercase = new Set([
  'all',
  'and',
  'and',
  'any',
  'as',
  'at',
  'between',
  'both',
  'by',
  'call',
  'case',
  'cast',
  'coalesce',
  'collation',
  'convert',
  'corresponding',
  'create',
  'cross',
  'cube',
  'current',
  'current_path',
  'default',
  'distinct',
  'do',
  'drop',
  'else',
  'every',
  'except',
  'exists',
  'fetch',
  'for',
  'from',
  'full',
  'grant',
  'group',
  'grouping',
  'having',
  'in',
  'inner',
  'intersect',
  'into',
  'is',
  'join',
  'leading',
  'left',
  'like',
  'natural',
  'normalize',
  'not',
  'nullif',
  'on',
  'or',
  'order',
  'outer',
  'primary',
  'references',
  'right',
  'rollup',
  'row',
  'select',
  'set',
  'some',
  'sum',
  'table',
  'then',
  'to',
  'trailing',
  'trigger',
  'union',
  'unique',
  'user',
  'using',
  'values',
  'when',
  'where',
  'with',
]);

