import {Nullable} from '../../util/nullable';
import {indentLines, unDoubleQuote} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {generalSqlKeywordsLowercase, SelectEntry} from "../sql-specs";

export class MySQLDialect implements SqlDialect
{
  readonly backtickQuotedStringRegex = /^`.*`$/;
  readonly doubleQuotedStringRegex = /^".*"$/;

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
      .map(se => `'${se.projectedName}', ${selectEntryValueSqlFn(se)}`)
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
    if (orderBy != null )
      throw new Error(`MySQL dialect does not support ordering in aggregate functions currently.`);

    return (
      'cast(coalesce(json_arrayagg(' +
        this.getRowObjectExpression(selectEntries, selectEntryValueSqlFn) +
      `), json_type('[]')) as json)`
    );
  }

  getAggregatedColumnValuesExpression
    (
      valueExpression: string,
      orderBy: Nullable<string>
    )
    : string
  {
    if (orderBy != null )
      throw new Error(`MySQL dialect does not support ordering in aggregate functions currently.`);

    return (`cast(coalesce(json_arrayagg(${valueExpression}), json_type('[]')) as json)`);
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.backtickQuotedStringRegex.test(name) )
      return name;
    if ( this.doubleQuotedStringRegex.test(name) )
      return `\`${unDoubleQuote(name)}\``;
    if ( !simpleIdentifierRegex.test(name) ||
         generalSqlKeywordsLowercase.has(name.toLowerCase()) )
      return `\`${name}\``;
    return name;
  }

  quoteColumnNameIfNeeded(name: string): string
  {
    if ( this.backtickQuotedStringRegex.test(name) )
      return name;
    if ( this.doubleQuotedStringRegex.test(name) )
      return `\`${unDoubleQuote(name)}\``;
    if ( !simpleIdentifierRegex.test(name) ||
         avoidColumnNamesLowercase.has(name.toLowerCase()) )
      return `\`${name}\``;
    return name;
  }
}

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const avoidColumnNamesLowercase = new Set([
  'add',
  'all',
  'alter',
  'analyze',
  'and',
  'as',
  'asc',
  'asensitive',
  'before',
  'between',
  'bigint',
  'binary',
  'blob',
  'both',
  'by',
  'call',
  'cascade',
  'case',
  'change',
  'char',
  'character',
  'check',
  'collate',
  'column',
  'condition',
  'constraint',
  'continue',
  'convert',
  'create',
  'cross',
  'cube',
  'cume_dist',
  'current_date',
  'current_time',
  'current_timestamp',
  'current_user',
  'cursor',
  'database',
  'databases',
  'day_hour',
  'day_microsecond',
  'day_minute',
  'day_second',
  'dec',
  'decimal',
  'declare',
  'default',
  'delayed',
  'delete',
  'dense_rank',
  'desc',
  'describe',
  'deterministic',
  'distinct',
  'distinctrow',
  'div',
  'double',
  'drop',
  'dual',
  'each',
  'else',
  'elseif',
  'enclosed',
  'escaped',
  'except',
  'exists',
  'exit',
  'explain',
  'false',
  'fetch',
  'float',
  'float4',
  'float8',
  'for',
  'force',
  'foreign',
  'from',
  'fulltext',
  'function',
  'generated',
  'get',
  'grant',
  'group',
  'grouping',
  'having',
  'high_priority',
  'hour_microsecond',
  'hour_minute',
  'hour_second',
  'if',
  'ignore',
  'in',
  'index',
  'infile',
  'inner',
  'inout',
  'insensitive',
  'insert',
  'int',
  'int1',
  'int2',
  'int3',
  'int4',
  'int8',
  'integer',
  'interval',
  'into',
  'is',
  'iterate',
  'join',
  'key',
  'keys',
  'kill',
  'lateral',
  'lead',
  'leading',
  'leave',
  'left',
  'like',
  'limit',
  'lines',
  'load',
  'localtime',
  'localtimestamp',
  'lock',
  'long',
  'longblob',
  'longtext',
  'loop',
  'low_priority',
  'match',
  'mediumblob',
  'mediumint',
  'mediumtext',
  'middleint',
  'minute_microsecond',
  'minute_second',
  'mod',
  'modifies',
  'natural',
  'no_write_to_binlog',
  'not',
  'null',
  'numeric',
  'of',
  'on',
  'optimize',
  'option',
  'optionally',
  'or',
  'order',
  'out',
  'outer',
  'outfile',
  'over',
  'partition',
  'percent_rank',
  'precision',
  'primary',
  'procedure',
  'purge',
  'range',
  'rank',
  'read',
  'reads',
  'real',
  'recursive',
  'references',
  'regexp',
  'release',
  'rename',
  'repeat',
  'replace',
  'require',
  'require',
  'resignal',
  'restrict',
  'return',
  'revoke',
  'right',
  'rlike',
  'row',
  'row_number',
  'rows',
  'schema',
  'schemas',
  'second_microsecond',
  'select',
  'sensitive',
  'separator',
  'set',
  'signal',
  'show',
  'smallint',
  'spatial',
  'specific',
  'sql',
  'sql_big_result',
  'sql_calc_found_rows',
  'sql_small_result',
  'sqlexception',
  'sqlstate',
  'sqlwarning',
  'ssl',
  'starting',
  'straight_join',
  'system',
  'table',
  'terminated',
  'then',
  'tinyblob',
  'tinyint',
  'tinytext',
  'to',
  'trailing',
  'trigger',
  'true',
  'undo',
  'union',
  'unique',
  'unlock',
  'unsigned',
  'update',
  'usage',
  'use',
  'using',
  'utc_date',
  'utc_time',
  'utc_timestamp',
  'values',
  'varbinary',
  'varchar',
  'varcharacter',
  'varying',
  'when',
  'where',
  'while',
  'window',
  'with',
  'write',
  'xor',
  'year_month',
  'zerofill'
]);
