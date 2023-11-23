import {Nullable} from '../../util/nullable';
import {indentLines} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {generalSqlKeywordsLowercase, SelectEntry} from "../sql-specs";

export class OracleDialect implements SqlDialect
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
      .map(se => `'${se.projectedName}' value ${selectEntryValueSqlFn(se)}`)
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
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string,
      orderBy: Nullable<string>
    )
    : string
  {
    return (
      'treat(coalesce(json_arrayagg(' +
        this.getRowObjectExpression(selectEntries, selectEntryValueSqlFn) +
        (orderBy != null ? ` order by ${orderBy}` : '') +
        ` returning clob), to_clob('[]')) as json)`
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
      `treat(coalesce(json_arrayagg(${valueExpression}` +
        (orderBy != null ? ` order by ${orderBy}` : '') +
        ` returning clob), to_clob('[]')) as json)`
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

  quoteColumnNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.uppercaseNameRegex.test(name) ||
         avoidColumnNamesLowercase.has(name.toLowerCase()) )
      return `"${name}"`;
    return name;
  }
}

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const avoidColumnNamesLowercase = new Set([
 'access',
 'add',
 'all',
 'alter',
 'and',
 'any',
 'as',
 'asc',
 'audit',
 'between',
 'by',
 'char',
 'check',
 'cluster',
 'column',
 'comment',
 'compress',
 'connect',
 'create',
 'current',
 'date',
 'decimal',
 'default',
 'delete',
 'desc',
 'distinct',
 'drop',
 'else',
 'exclusive',
 'exists',
 'file',
 'float',
 'for',
 'from',
 'grant',
 'group',
 'having',
 'identified',
 'immediate',
 'in',
 'increment',
 'index',
 'initial',
 'insert',
 'integer',
 'intersect',
 'into',
 'is',
 'level',
 'like',
 'lock',
 'long',
 'maxextents',
 'minus',
 'mlslabel',
 'mode',
 'modify',
 'noaudit',
 'nocompress',
 'not',
 'nowait',
 'null',
 'number',
 'of',
 'offline',
 'on',
 'online',
 'option',
 'or',
 'order',
 'pctfree',
 'prior',
 'public',
 'raw',
 'rename',
 'resource',
 'revoke',
 'row',
 'rowid',
 'rownum',
 'rows',
 'select',
 'session',
 'set',
 'share',
 'size',
 'smallint',
 'start',
 'successful',
 'synonym',
 'sysdate',
 'table',
 'then',
 'to',
 'trigger',
 'uid',
 'union',
 'unique',
 'update',
 'user',
 'validate',
 'values',
 'varchar',
 'varchar2',
 'view',
 'whenever',
 'where',
 'with',
]);