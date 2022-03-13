import { ForeignKeyComponent } from "../dbmd";
import { lowerCaseInitials, makeNameNotInSet } from "../util/strings";

export interface SqlSpec
{
  selectEntries: SelectEntry[];
  fromEntries: FromEntry[];
  whereEntries?: WhereEntry[] | null;
  orderBy?: OrderBy | null;
  forUpdate?: boolean | null;
  wrapPropertiesInJsonObject?: boolean;
  aggregateToArray?: boolean;
  selectEntriesLeadingComment?: string;
  fromEntriesLeadingComment?: string;
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
  entryType: 'field';
  projectedName: string;
  fieldName: string;
  tableAlias: string;
}

export interface ExpressionSelectEntry
{
  entryType: 'expr';
  projectedName: string;
  expression: string;
  tableAliasPlaceholderInExpr?: string; // default is '$$'
  tableAlias: string;
}

export interface InlineParentSelectEntry
{
  entryType: 'inline-parent-prop';
  projectedName: string;
  parentAlias: string;
  comment?: string | null;
}

export interface ParentReferenceSelectEntry
{
  entryType: 'parent-ref';
  projectedName: string;
  parentRowObjectSql: SqlSpec,
  comment?: string;
}

export interface ChildCollectionSelectEntry
{
  entryType: 'child-coll';
  projectedName: string;
  collectionSql: SqlSpec;
  comment?: string;
}

export interface HiddenPrimaryKeySelectEntry
{
  entryType: 'hidden-pkf'
  pkFieldName: string;
  projectedName: string;
  tableAlias: string;
}

export type FromEntry =
  TableFromEntry |
  QueryFromEntry;

export interface TableFromEntry
{
  entryType: 'table';
  table: { schema?: string | null, name: string };
  alias: string;
  joinCondition?: JoinCondition;
  comment?: null;
}

export interface QueryFromEntry
{
  entryType: 'query';
  query: SqlSpec;
  alias: string;
  joinCondition?: JoinCondition;
  comment?: string;
}

export interface JoinCondition
{
  joinType: JoinType;
  parentChildCondition: ParentChildCondition;
}

export type JoinType = 'INNER' | 'LEFT';

export type ParentChildCondition = (ParentPrimaryKeyCondition | ChildForeignKeyCondition ) & { fromAlias: string };

export interface ParentPrimaryKeyCondition
{
  condType: 'pk';
  childAlias: string;
  matchedFields: ForeignKeyComponent[];
}

export interface ChildForeignKeyCondition
{
  condType: 'fk';
  parentAlias: string;
  matchedFields: ForeignKeyComponent[];
}

export type WhereEntry = GeneralSqlWhereEntry | ParentChildCondition;

export interface GeneralSqlWhereEntry
{
  condType: 'gen';
  condSql: string;
  tableAliasPlaceholderInCondSql?: string; // default is '$$'
  tableAlias: string;
}

export interface OrderBy
{
  orderBy: string;
  tableAlias: string;
}

export class SqlParts
{
  constructor
  (
    private aliases: Set<string> = new Set(),
    private selectEntries: SelectEntry[] = [],
    private fromEntries: FromEntry[] = [],
    private whereEntries: WhereEntry[] = [],
    private orderBy: OrderBy | null = null,
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

  addParts(otherParts: SqlParts)
  {
    this.selectEntries.push(...otherParts.selectEntries);
    this.fromEntries.push(...otherParts.fromEntries);
    this.whereEntries.push(...otherParts.whereEntries);
    this.addAliasesToScope(otherParts.aliases);
    if (otherParts.orderBy) throw new Error('Cannot add sql parts containing an orderBy value');
  }

  createAliasFor(dbObjectName: string): string
  {
    const alias = makeNameNotInSet(lowerCaseInitials(dbObjectName, '_'), this.aliases);
    this.aliases.add(alias);
    return alias;
  }

  toSqlSpec(): SqlSpec
  {
    const sqlSpec = {
      selectEntries: this.selectEntries,
      fromEntries: this.fromEntries,
      whereEntries: this.whereEntries,
      orderBy: this.orderBy
    };

    // Re-init to transfer ownership of our arrays to the sqlSpec object.
    this.selectEntries = [];
    this.fromEntries = [];
    this.whereEntries = [];
    this.orderBy = null;
    this.aliases = new Set();

    return sqlSpec;
  }
}

export function getPropertySelectEntries(sql: SqlSpec): SelectEntry[]
{
  return sql.selectEntries.filter(e => e.entryType !== 'hidden-pkf');
}
