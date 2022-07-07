import { Field, ForeignKeyComponent, RelId } from "../dbmd";
import { AdditionalObjectPropertyColumn } from "../query-specs";
import { sorted } from "../util/collections";
import { Nullable } from "../util/mod";
import { lowerCaseInitials, makeNameNotInSet } from "../util/strings";

export interface SqlSpec
{
  selectEntries: SelectEntry[];
  fromEntries: FromEntry[];
  whereEntries?: Nullable<WhereEntry[]>;
  orderBy?: Nullable<OrderBy>;
  forUpdate?: Nullable<boolean>;
  objectWrapProperties?: Nullable<boolean>;
  additionalObjectPropertyColumns?: Nullable<AdditionalObjectPropertyColumn[]>;
  aggregateToArray?: Nullable<boolean>;
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
}

export interface ExpressionSelectEntry
{
  readonly entryType: 'se-expr';
  readonly projectedName: string;
  readonly expression: string;
  readonly tableAliasPlaceholderInExpr?: Nullable<string>; // default is '$$'
  readonly tableAlias: string;
  readonly displayOrder?: Nullable<number>;
  readonly sourceCodeFieldType: Nullable<string | { [srcLang: string]: string }>;
}

export interface InlineParentSelectEntry
{
  readonly entryType: 'se-inline-parent-prop';
  readonly projectedName: string;
  readonly parentAlias: string;
  readonly parentTable: RelId;
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
  readonly displayOrder?: undefined;
}

export type FromEntry =
  TableFromEntry |
  QueryFromEntry;

export interface TableFromEntry
{
  readonly entryType: 'table';
  readonly table: RelId;
  readonly alias: string;
  readonly join?: Nullable<Join>;
  readonly comment?: undefined;
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
  (ParentPrimaryKeyCondition | ChildForeignKeyCondition ) & { readonly fromAlias: string };

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
    const alias = makeNameNotInSet(lowerCaseInitials(relName, '_') + '_', this.aliases);
    this.aliases.add(alias);
    return alias;
  }

  toSqlSpec(): SqlSpec
  {
    const displayOrderedSelectEntries =
      sorted(
        this.selectEntries.map((se, ix) => ({ ...se, dislayOrder: se.displayOrder ?? ix + 1 })),
        (se1, se2) => (se1.displayOrder ?? 0) - (se2.displayOrder ?? 0)
      );

    const sqlSpec = {
      selectEntries: displayOrderedSelectEntries,
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