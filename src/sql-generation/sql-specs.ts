import {Field, ForeignKeyComponent, RelId} from "../dbmd";
import {Nullable} from "../util/mod";
import {lowerCaseInitials, makeNameNotInSet} from "../util/strings";

export interface SqlSpec
{
  selectEntries: SelectEntry[];
  fromEntries: FromEntry[];
  whereEntries?: Nullable<WhereEntry[]>;
  orderBy?: Nullable<OrderBy>;
  forUpdate?: Nullable<boolean>;
  objectWrapProperties?: Nullable<boolean>;
  additionalOutputSelectEntries?: Nullable<AdditionalOutputSelectEntry[]>;
  aggregateToArray?: Nullable<boolean>;
  aggregateOrderBy?: Nullable<string>;
  selectEntriesLeadingComment?: Nullable<string>;
  fromEntriesLeadingComment?: Nullable<string>;
  resultTypeName?: Nullable<string>;
}

export type SelectEntry =
  FieldSelectEntry |
  ExpressionSelectEntry |
  InlineParentSelectEntry |
  ParentReferenceSelectEntry |
  ChildCollectionSelectEntry |
  HiddenPrimaryKeySelectEntry;

export interface FieldSelectEntry
{
  readonly entryType: 'se-field';
  readonly field: Field;
  readonly projectedName: string;
  readonly tableAlias: string;
  readonly displayOrder?: Nullable<number>;
  readonly sourceCodeFieldType: Nullable<string | { [srcLang: string]: string }>;
  readonly comment?: Nullable<string>;
}

export interface ExpressionSelectEntry
{
  readonly entryType: 'se-expr';
  readonly projectedName: string;
  readonly expression: string;
  readonly tableAliasPlaceholderInExpr?: Nullable<string>; // default is '$$'
  readonly tableAlias: string;
  readonly displayOrder?: Nullable<number>;
  readonly sourceCodeFieldType: string | { [srcLang: string]: string };
  readonly comment?: Nullable<string>;
}

export interface InlineParentSelectEntry
{
  readonly entryType: 'se-inline-parent-prop';
  readonly projectedName: string;
  readonly parentAlias: string;
  readonly parentTable: RelId;
  readonly parentSelectEntry: SelectEntry,
  readonly comment?: Nullable<string>;
  readonly displayOrder?: Nullable<number>;
}

export interface ParentReferenceSelectEntry
{
  readonly entryType: 'se-parent-ref';
  readonly projectedName: string;
  readonly parentRowObjectSql: SqlSpec,
  readonly comment?: Nullable<string>;
  readonly displayOrder?: Nullable<number>;
}

export interface ChildCollectionSelectEntry
{
  readonly entryType: 'se-child-coll';
  readonly projectedName: string;
  readonly collectionSql: SqlSpec;
  readonly comment?: Nullable<string>;
  readonly displayOrder?: Nullable<number>;
}

export interface HiddenPrimaryKeySelectEntry
{
  readonly entryType: 'se-hidden-pkf'
  readonly pkFieldName: string;
  readonly projectedName: string;
  readonly tableAlias: string;
  readonly displayOrder?: Nullable<number>;
  readonly comment?: Nullable<string>;
}

export type AdditionalOutputSelectEntry = FieldSelectEntry | ExpressionSelectEntry;

export type FromEntry =
  TableFromEntry |
  QueryFromEntry;

export interface TableFromEntry
{
  readonly entryType: 'table';
  readonly table: RelId;
  readonly alias: string;
  readonly join?: Nullable<Join>;
  readonly comment?: Nullable<string>;
}

export interface QueryFromEntry
{
  readonly entryType: 'query';
  readonly query: SqlSpec;
  readonly alias: string;
  readonly join?: Nullable<Join>;
  readonly comment?: Nullable<string>;
}

export interface Join
{
  readonly joinType: JoinType;
  readonly parentChildCondition: ParentChildCondition;
}

export type JoinType = 'INNER' | 'LEFT';

export type ParentChildCondition =
  (ParentPrimaryKeyCondition | ChildForeignKeyCondition) &
  { readonly fromAlias: string }; // The FROM clause entry alias that the condition is applied on.

export interface ParentPrimaryKeyCondition
{
  readonly condType: 'pcc-on-pk';
  readonly childAlias: string;
  readonly matchedFields: ForeignKeyComponent[];
  readonly matchMustExist: boolean;
}

export interface ChildForeignKeyCondition
{
  readonly condType: 'pcc-on-fk';
  readonly parentAlias: string;
  readonly matchedFields: ForeignKeyComponent[];
  readonly matchMustExist: boolean;
}

export type WhereEntry = GeneralSqlWhereEntry | ParentChildCondition;

export interface GeneralSqlWhereEntry
{
  readonly condType: 'general';
  readonly condSql: string;
  readonly tableAliasPlaceholderInCondSql?: Nullable<string>; // default is '$$'
  readonly tableAlias: string;
}

export interface OrderBy
{
  readonly orderBy: string;
  readonly tableAlias: string;
}

export class SqlParts
{
  constructor
  (
    private aliases: Set<string> = new Set(),
    private selectEntries: SelectEntry[] = [],
    private fromEntries: FromEntry[] = [],
    private whereEntries: WhereEntry[] = [],
    private orderBy: Nullable<OrderBy> = null,
    private resultTypeName: Nullable<string> = null
  )
  {}

  addFromEntry(entry: FromEntry)
  {
    this.fromEntries.push(entry);
  }

  addWhereEntry(entry: WhereEntry)
  {
    this.whereEntries.push(entry);
  }

  addAlias(alias: string)
  {
    this.aliases.add(alias);
  }

  addSelectEntry(entry: SelectEntry)
  {
    this.selectEntries.push(entry);
  }

  addSelectEntries(entries: SelectEntry[])
  {
    if (entries.length > 0)
      this.selectEntries.push(...entries);
  }

  getAliases(): Set<string>
  {
    return this.aliases;
  }

  addAliasesToScope(aliases: Set<string>) { aliases.forEach(a => this.aliases.add(a)); }

  setOrderBy(orderBy: OrderBy)
  {
    this.orderBy = orderBy;
  }

  setResultTypeName(resultTypeName: string)
  {
    this.resultTypeName = resultTypeName;
  }

  addParts(otherParts: SqlParts)
  {
    this.selectEntries.push(...otherParts.selectEntries);
    this.fromEntries.push(...otherParts.fromEntries);
    this.whereEntries.push(...otherParts.whereEntries);
    this.addAliasesToScope(otherParts.aliases);
    if (otherParts.orderBy) throw new Error('Cannot add sql parts containing orderBy.');
    if (otherParts.resultTypeName) throw new Error('Cannot add sql parts containing resultTypeName.');
  }

  createTableAlias(relName: string): string
  {
    const alias = createTableAlias(relName, this.aliases);
    this.aliases.add(alias);
    return alias;
  }

  toSqlSpec(): SqlSpec
  {
    const sqlSpec = {
      selectEntries: this.selectEntries,
      fromEntries: this.fromEntries,
      whereEntries: this.whereEntries,
      orderBy: this.orderBy,
      resultTypeName: this.resultTypeName,
    };

    // Re-init to transfer ownership of our arrays to the sqlSpec object.
    this.selectEntries = [];
    this.fromEntries = [];
    this.whereEntries = [];
    this.orderBy = null;
    this.resultTypeName = null;
    this.aliases = new Set();

    return sqlSpec;
  }
}

export function getPropertySelectEntries(sql: SqlSpec): SelectEntry[]
{
  return sql.selectEntries.filter(e => e.entryType !== 'se-hidden-pkf');
}

// Return the table in leading postion in from clause if it exists, else throw error.
export function getBaseTable(sql: SqlSpec): RelId
{
  if (sql.fromEntries[0]?.entryType === 'table') return sql.fromEntries[0].table;
  else throw new Error(`No base table for sql: ${sql}`);
}

export const generalSqlKeywordsLowercase = new Set([
  'a',
  'abort',
  'abs',
  'absolute',
  'access',
  'action',
  'ada',
  'add',
  'admin',
  'after',
  'aggregate',
  'alias',
  'all',
  'allocate',
  'also',
  'alter',
  'always',
  'analyse',
  'analyze',
  'and',
  'any',
  'are',
  'array',
  'as',
  'asc',
  'asensitive',
  'assertion',
  'assignment',
  'asymmetric',
  'at',
  'atomic',
  'attribute',
  'attributes',
  'audit',
  'authorization',
  'auto_increment',
  'avg',
  'avg_row_length',
  'backup',
  'backward',
  'before',
  'begin',
  'bernoulli',
  'between',
  'bigint',
  'binary',
  'bit',
  'bit_length',
  'bitvar',
  'blob',
  'bool',
  'boolean',
  'both',
  'breadth',
  'break',
  'browse',
  'bulk',
  'by',
  'c',
  'cache',
  'call',
  'called',
  'cardinality',
  'cascade',
  'cascaded',
  'case',
  'cast',
  'catalog',
  'catalog_name',
  'ceil',
  'ceiling',
  'chain',
  'change',
  'char',
  'char_length',
  'character',
  'character_length',
  'character_set_catalog',
  'character_set_name',
  'character_set_schema',
  'characteristics',
  'characters',
  'check',
  'checked',
  'checkpoint',
  'checksum',
  'class',
  'class_origin',
  'clob',
  'close',
  'cluster',
  'clustered',
  'coalesce',
  'cobol',
  'collate',
  'collation',
  'collation_catalog',
  'collation_name',
  'collation_schema',
  'collect',
  'column',
  'column_name',
  'columns',
  'command_function',
  'command_function_code',
  'comment',
  'commit',
  'committed',
  'completion',
  'compress',
  'compute',
  'condition',
  'condition_number',
  'connect',
  'connection',
  'connection_name',
  'constraint',
  'constraint_catalog',
  'constraint_name',
  'constraint_schema',
  'constraints',
  'constructor',
  'contains',
  'containstable',
  'continue',
  'conversion',
  'convert',
  'copy',
  'corr',
  'corresponding',
  'count',
  'covar_pop',
  'covar_samp',
  'create',
  'createdb',
  'createrole',
  'createuser',
  'cross',
  'csv',
  'cube',
  'cume_dist',
  'current',
  'current_date',
  'current_default_transform_group',
  'current_path',
  'current_role',
  'current_time',
  'current_timestamp',
  'current_transform_group_for_type',
  'current_user',
  'cursor',
  'cursor_name',
  'cycle',
  'data',
  'database',
  'databases',
  'date',
  'datetime',
  'datetime_interval_code',
  'datetime_interval_precision',
  'day',
  'day_hour',
  'day_microsecond',
  'day_minute',
  'day_second',
  'dayofmonth',
  'dayofweek',
  'dayofyear',
  'dbcc',
  'deallocate',
  'dec',
  'decimal',
  'declare',
  'default',
  'defaults',
  'deferrable',
  'deferred',
  'defined',
  'definer',
  'degree',
  'delay_key_write',
  'delayed',
  'delete',
  'delimiter',
  'delimiters',
  'dense_rank',
  'deny',
  'depth',
  'deref',
  'derived',
  'desc',
  'describe',
  'descriptor',
  'destroy',
  'destructor',
  'deterministic',
  'diagnostics',
  'dictionary',
  'disable',
  'disconnect',
  'disk',
  'dispatch',
  'distinct',
  'distinctrow',
  'distributed',
  'div',
  'do',
  'domain',
  'double',
  'drop',
  'dual',
  'dummy',
  'dump',
  'dynamic',
  'dynamic_function',
  'dynamic_function_code',
  'each',
  'element',
  'else',
  'elseif',
  'enable',
  'enclosed',
  'encoding',
  'encrypted',
  'end',
  'end-exec',
  'enum',
  'equals',
  'errlvl',
  'escape',
  'escaped',
  'every',
  'except',
  'exception',
  'exclude',
  'excluding',
  'exclusive',
  'exec',
  'execute',
  'existing',
  'exists',
  'exit',
  'exp',
  'explain',
  'external',
  'extract',
  'false',
  'fetch',
  'fields',
  'file',
  'fillfactor',
  'filter',
  'final',
  'first',
  'float',
  'float4',
  'float8',
  'floor',
  'flush',
  'following',
  'for',
  'force',
  'foreign',
  'fortran',
  'forward',
  'found',
  'free',
  'freetext',
  'freetexttable',
  'freeze',
  'from',
  'full',
  'fulltext',
  'function',
  'fusion',
  'g',
  'general',
  'generated',
  'get',
  'global',
  'go',
  'goto',
  'grant',
  'granted',
  'grants',
  'greatest',
  'group',
  'grouping',
  'handler',
  'having',
  'header',
  'heap',
  'hierarchy',
  'high_priority',
  'hold',
  'holdlock',
  'host',
  'hosts',
  'hour',
  'hour_microsecond',
  'hour_minute',
  'hour_second',
  'identified',
  'identity',
  'identity_insert',
  'identitycol',
  'if',
  'ignore',
  'ilike',
  'immediate',
  'immutable',
  'implementation',
  'implicit',
  'in',
  'include',
  'including',
  'increment',
  'index',
  'indicator',
  'infile',
  'infix',
  'inherit',
  'inherits',
  'initial',
  'initialize',
  'initially',
  'inner',
  'inout',
  'input',
  'insensitive',
  'insert',
  'insert_id',
  'instance',
  'instantiable',
  'instead',
  'int',
  'int1',
  'int2',
  'int3',
  'int4',
  'int8',
  'integer',
  'intersect',
  'intersection',
  'interval',
  'into',
  'invoker',
  'is',
  'isam',
  'isnull',
  'isolation',
  'iterate',
  'join',
  'k',
  'key',
  'key_member',
  'key_type',
  'keys',
  'kill',
  'lancompiler',
  'language',
  'large',
  'last',
  'last_insert_id',
  'lateral',
  'lead',
  'leading',
  'least',
  'leave',
  'left',
  'length',
  'less',
  'level',
  'like',
  'limit',
  'lineno',
  'lines',
  'listen',
  'ln',
  'load',
  'local',
  'localtime',
  'localtimestamp',
  'location',
  'locator',
  'lock',
  'login',
  'logs',
  'long',
  'longblob',
  'longtext',
  'loop',
  'low_priority',
  'lower',
  'm',
  'map',
  'match',
  'matched',
  'max',
  'max_rows',
  'maxextents',
  'maxvalue',
  'mediumblob',
  'mediumint',
  'mediumtext',
  'member',
  'merge',
  'message_length',
  'message_octet_length',
  'message_text',
  'method',
  'middleint',
  'min',
  'min_rows',
  'minus',
  'minute',
  'minute_microsecond',
  'minute_second',
  'minvalue',
  'mlslabel',
  'mod',
  'mode',
  'modifies',
  'modify',
  'module',
  'month',
  'monthname',
  'more',
  'move',
  'multiset',
  'mumps',
  'myisam',
  'name',
  'names',
  'national',
  'natural',
  'nchar',
  'nclob',
  'nesting',
  'new',
  'next',
  'no',
  'no_write_to_binlog',
  'noaudit',
  'nocheck',
  'nocompress',
  'nocreatedb',
  'nocreaterole',
  'nocreateuser',
  'noinherit',
  'nologin',
  'nonclustered',
  'none',
  'normalize',
  'normalized',
  'nosuperuser',
  'not',
  'nothing',
  'notify',
  'notnull',
  'nowait',
  'null',
  'nullable',
  'nullif',
  'nulls',
  'number',
  'numeric',
  'object',
  'octet_length',
  'octets',
  'of',
  'off',
  'offline',
  'offset',
  'offsets',
  'oids',
  'old',
  'on',
  'online',
  'only',
  'open',
  'opendatasource',
  'openquery',
  'openrowset',
  'openxml',
  'operation',
  'operator',
  'optimize',
  'option',
  'optionally',
  'options',
  'or',
  'order',
  'ordering',
  'ordinality',
  'others',
  'out',
  'outer',
  'outfile',
  'output',
  'over',
  'overlaps',
  'overlay',
  'overriding',
  'owner',
  'pack_keys',
  'pad',
  'parameter',
  'parameter_mode',
  'parameter_name',
  'parameter_ordinal_position',
  'parameter_specific_catalog',
  'parameter_specific_name',
  'parameter_specific_schema',
  'parameters',
  'partial',
  'partition',
  'pascal',
  'password',
  'path',
  'pctfree',
  'percent',
  'percent_rank',
  'percentile_cont',
  'percentile_disc',
  'placing',
  'plan',
  'pli',
  'position',
  'postfix',
  'power',
  'preceding',
  'precision',
  'prefix',
  'preorder',
  'prepare',
  'prepared',
  'preserve',
  'primary',
  'print',
  'prior',
  'privileges',
  'proc',
  'procedural',
  'procedure',
  'process',
  'processlist',
  'public',
  'purge',
  'quote',
  'raid0',
  'raiserror',
  'range',
  'rank',
  'raw',
  'read',
  'reads',
  'readtext',
  'real',
  'recheck',
  'reconfigure',
  'recursive',
  'ref',
  'references',
  'referencing',
  'regexp',
  'regr_avgx',
  'regr_avgy',
  'regr_count',
  'regr_intercept',
  'regr_r2',
  'regr_slope',
  'regr_sxx',
  'regr_sxy',
  'regr_syy',
  'reindex',
  'relative',
  'release',
  'reload',
  'rename',
  'repeat',
  'repeatable',
  'replace',
  'replication',
  'require',
  'reset',
  'resignal',
  'resource',
  'restart',
  'restore',
  'restrict',
  'result',
  'return',
  'returned_cardinality',
  'returned_length',
  'returned_octet_length',
  'returned_sqlstate',
  'returns',
  'revoke',
  'right',
  'rlike',
  'role',
  'rollback',
  'rollup',
  'routine',
  'routine_catalog',
  'routine_name',
  'routine_schema',
  'row',
  'row_count',
  'row_number',
  'rowcount',
  'rowguidcol',
  'rowid',
  'rownum',
  'rows',
  'rule',
  'save',
  'savepoint',
  'scale',
  'schema',
  'schema_name',
  'schemas',
  'scope',
  'scope_catalog',
  'scope_name',
  'scope_schema',
  'scroll',
  'search',
  'second',
  'second_microsecond',
  'section',
  'security',
  'select',
  'self',
  'sensitive',
  'separator',
  'sequence',
  'serializable',
  'server_name',
  'session',
  'session_user',
  'set',
  'setof',
  'sets',
  'setuser',
  'share',
  'show',
  'shutdown',
  'signal',
  'similar',
  'simple',
  'size',
  'smallint',
  'some',
  'soname',
  'source',
  'space',
  'spatial',
  'specific',
  'specific_name',
  'specifictype',
  'sql',
  'sql_big_result',
  'sql_big_selects',
  'sql_big_tables',
  'sql_calc_found_rows',
  'sql_log_off',
  'sql_log_update',
  'sql_low_priority_updates',
  'sql_select_limit',
  'sql_small_result',
  'sql_warnings',
  'sqlca',
  'sqlcode',
  'sqlerror',
  'sqlexception',
  'sqlstate',
  'sqlwarning',
  'sqrt',
  'ssl',
  'stable',
  'start',
  'starting',
  'state',
  'statement',
  'static',
  'statistics',
  'status',
  'stddev_pop',
  'stddev_samp',
  'stdin',
  'stdout',
  'storage',
  'straight_join',
  'strict',
  'string',
  'structure',
  'style',
  'subclass_origin',
  'sublist',
  'submultiset',
  'substring',
  'successful',
  'sum',
  'superuser',
  'symmetric',
  'synonym',
  'sysdate',
  'sysid',
  'system',
  'system_user',
  'table',
  'table_name',
  'tables',
  'tablesample',
  'tablespace',
  'temp',
  'template',
  'temporary',
  'terminate',
  'terminated',
  'text',
  'textsize',
  'than',
  'then',
  'ties',
  'time',
  'timestamp',
  'timezone_hour',
  'timezone_minute',
  'tinyblob',
  'tinyint',
  'tinytext',
  'to',
  'toast',
  'top',
  'top_level_count',
  'trailing',
  'tran',
  'transaction',
  'transaction_active',
  'transactions_committed',
  'transactions_rolled_back',
  'transform',
  'transforms',
  'translate',
  'translation',
  'treat',
  'trigger',
  'trigger_catalog',
  'trigger_name',
  'trigger_schema',
  'trim',
  'true',
  'truncate',
  'trusted',
  'tsequal',
  'type',
  'uescape',
  'uid',
  'unbounded',
  'uncommitted',
  'under',
  'undo',
  'unencrypted',
  'union',
  'unique',
  'unknown',
  'unlisten',
  'unlock',
  'unnamed',
  'unnest',
  'unsigned',
  'until',
  'update',
  'updatetext',
  'upper',
  'usage',
  'use',
  'user',
  'user_defined_type_catalog',
  'user_defined_type_code',
  'user_defined_type_name',
  'user_defined_type_schema',
  'using',
  'utc_date',
  'utc_time',
  'utc_timestamp',
  'vacuum',
  'valid',
  'validate',
  'validator',
  'value',
  'values',
  'var_pop',
  'var_samp',
  'varbinary',
  'varchar',
  'varchar2',
  'varcharacter',
  'variable',
  'variables',
  'varying',
  'verbose',
  'view',
  'volatile',
  'waitfor',
  'when',
  'whenever',
  'where',
  'while',
  'width_bucket',
  'window',
  'with',
  'within',
  'without',
  'work',
  'write',
  'writetext',
  'x509',
  'xor',
  'year',
  'year_month',
  'zerofill',
  'zone',
]);

export function createTableAlias(relName: string, avoid: Set<string>): string
{
  let alias = makeNameNotInSet(lowerCaseInitials(relName, '_'), avoid);
  if (alias.length > 1 && generalSqlKeywordsLowercase.has(alias.toLowerCase()))
    alias = alias + "_";
  return alias;
}