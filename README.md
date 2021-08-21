# SQL/JSON-Query

## Overview
This is a tool to be used as part of an application's build process to generate
SQL/JSON nested data queries together with their matching result type declarations.
As a developer, your job in the process is to supply a file `query-specs.ts`
which provides a list of query specifications, where each specification describes a
hierarchy of data to be fetched for a query. From these query specifications and
a database metadata file (generated from a database via included tool), the tool
will generate:
- SQL/JSON nested data queries for Oracle or Postgres to fetch the data,
- Result type declarations in TypeScript or Java which match the structure of 
  the generated SQL and to which the query results can be directly deserialized.
- Column-level metadata for all relations (tables/views) in TypeScript or Java, which
  can be used to refer to tables/columns in INSERT/UPDATE/DELETE statements in an
  error-resistant way.

(TODO: diagram)
```
    dbmd (auto-generated from db) -> relations metadata (Java, TS)
     +
query-specs (supplied by programmer)
  (build time)
       ->               SQL files (Postgres or Oracle SQL/JSON)
       ->               Query result type definitions (Java, TS)
```

When generating queries, database metadata is used to verify all tables, fields, and
foreign key relationships used in the queries, failing with an error if any referenced
database items are not found in database metadata. A self-contained tool to fetch this
database metadata for Oracle and PostgresSQL databases is included.

The query generation work is all done at build time, and there is no run-time component
needed to use the generated SQL queries and generated result types. The SQL can be
executed by any preferred means, and deserialized to the generated result types using
any library suitable for the purpose, such as Jackson in Java, or via `JSON.parse()`
in TypeScript.

## Query Group Specification

Queries to be generated are contained in a `QueryGroupSpec` structure, which allows
setting some options that apply to all the queries.

### `QueryGroupSpec` interface
```typescript
interface QueryGroupSpec
{
  defaultSchema?: string;
  propertyNameDefault?: PropertyNameDefault;
  generateUnqualifiedNamesForSchemas: string[];
  querySpecs: QuerySpec[];
}
```

#### `defaultSchema`

  Any unqualified table or view referenced in a query specification is assumed to
  belong to the default schema specified here. This allows table/view references to be
  unqualified in query definitions for convenience and readability, while also allowing
  the query generator to precisely find the relation in the database metadata, where
  relations are stored in fully qualified form.

#### `propertyNameDefault`

  The property name default describes how json property names are to be
  derived from database field names, when the property name is not specified
  directly in the query specification.
  Valid values are:

  - `AS_IN_DB`: JSON property name will equal the database field name exactly.
A database field `account_number` would yield a JSON property name
      of `account_number` with this setting.

  - `CAMELCASE`: JSON property name will be the camelcase form of the database field
name. A database field `account_number` would yield a JSON property name
of `accountNumber` with this setting.
  
#### `generateUnqualifiedNamesForSchemas`

  This setting determines which relation names are qualified in generated SQL. Any relation
  belonging to a schema in this list will be referred to in unqualified form in generated SQL.
  Your ability to use unqualified names in generated SQL depends on how your application connects
  to your database to execute the generated SQL. Generally if you connect to a schema directly
  (as with Oracle) or have it on a schema search path (if supported by your database such as
  with Postgres), then you should be able to add your schema in this list to generated unqualified
  names in your SQL. If you don't care how the generated SQL looks then it's always safe to leave
  this list empty.

#### `querySpecs`

The heart of the query group specification, these are the specifications for the SQL/JSON
nested data queries to be generated for your application. Result types in either TypeScript or
Java are also generated from these. The specifics of the query specifications are described
in detail below.

### `QueryGroupSpec` usage example

If using the ready-made [project dropin](https://github.com/scharris/sqljson-query-dropin)
to add query generation capability to a project, then you define your single `QueryGroupSpec`
object in file `<query-gen-folder>/queries/query-specs.ts`, and export it from that module
as `queryGroupSpec`.

```typescript
export const queryGroupSpec: QueryGroupSpec = {
   defaultSchema: "drugs",
   generateUnqualifiedNamesForSchemas: ["drugs"],
   propertyNameDefault: "CAMELCASE",
   querySpecs: [
     // ...
   ]
};
```

## Query Specification

A query specification describes a single query as a hierarchy of data to be fetched. It usually
defines the generation of a single SQL file, but may specify multiple `resultRepresenations` in
which case multiple SQL files will be generated for the query. In all cases it yields at most
one TypeScript module and Java class representing result types for the query.

### `QuerySpec` interface

```typescript
interface QuerySpec
{
  queryName: string;
  tableJson: TableJsonSpec;
  resultRepresentations?: ResultRepr[];
  generateResultTypes?: boolean;
  generateSource?: boolean;
  propertyNameDefault?: PropertyNameDefault;
  orderBy?: string;
  forUpdate?: boolean;
  typesFileHeader?: string;
}
```

#### `queryName`

This required field defines a name of the given query, which can be several words separated
by spaces, dashes, or underscores, such as "drugs with cautions and functional categories query".
The query name should be unique in the `QueryGroupSpec` and is used to form the names of the
generated SQL files, as well as the module name or class name for generated TypeScript or Java
sources representing the query result types. SQL file names and TypeScript module names are
based on the dashed form of the tokenized query name, for example
`drugs-with-cautions-and-functional-categories-query.sql/ts` for the query name above. The Java
class name containing result type definitions is the camelcase form of the query name, for
example `DrugsWithCautionsAndFunctionalCategoriesQuery`.

#### `tableJson`

This required field is the heart of the query definition, specifying a top table and nested
related tables, recursively, with details about how to convert each to JSON format. This
structure is described in detail below.

#### `resultRepresentations`

This optional array of `ResultRepr` determines one or more variants of SQL that are to be
generated for the query, related to how the results are to be represented in rows/columns.
A query may generate up to three SQL variants, each in its own SQL file which will end
with the variant name in parentheses if multiple variants are selected.

```
type ResultRepr = "MULTI_COLUMN_ROWS" | "JSON_OBJECT_ROWS" | "JSON_ARRAY_ROW";
```

* `MULTI_COLUMN_ROWS`: The result set will consist of multiple rows, with one row per
result row from the top table in the hierarchy of results. Top level rows are presented in
multi-column form as in the top level table itself. The column values themselves may be
either database types coming directly from a table or JSON objects representing data
collected from related tables.


* `JSON_OBJECT_ROWS` (the default): As above, the result set will consist of multiple rows, with one row
per result row from the top table in the hierarchy of results. But in this case each row
consists of exactly one column, which contains the JSON object representation of the
hierarchy of data for the top-level table row and its related data from related tables.


* `JSON_ARRAY_ROW`: In this result style the query will yield only a single row, which consists
of only one column. The entire result set in this case is represented as a single JSON array
value, the elements of which are JSON objects representing the result rows from the top table
and data related to the row from the related tables.

#### `generateResultTypes`

Controls whether Java or TypeScript source code representing result types for the query should be generated.
The default value is `true`.

#### `generateSource`

If `false`, no SQL nor Java or TypeScript source will be generated.
Default is `true`.

#### `propertyNameDefault`

Controls how JSON property names are derived from database field names for
this specific query, overriding any setting at the level of the `QueryGroupSpec`.
See the description of the field of the same name in `QueryGroupSpec` for details.

#### `orderBy`

This optional property is a SQL expression controlling the ordering of the results
from the top-level table in the query.

#### `forUpdate`

If `true`, a `for update` clause will be added to the generated SQL, causing the fetched
rows to be locked for the duration of the transaction in which the query occurs.

#### `typesFileHeader`

Optional text which will be included above the generated Java or TypeScript result type definitions.
This text is not interpreted by the tool and will be included verbatim in the generated source code,
just below standard imports if any. Often this is used to add imports for types referred to in
customized field result types.


### `TableJsonSpec` interface

The `TableJsonSpec` structure describes how the data content of a given table and its related tables
should be represented in JSON format. TableJsonSpec is the heart of the query specification, where
it describes how to form JSON output for the top table which is the subject of the query. The
structure also describes how data for related tables is to be included via nested `TableJsonSpec`
in the `parentTables` and `childTables` members of the `TableJsonSpec`, and so on to any level of
nesting required through related tables.

```typescript
interface TableJsonSpec
{
  table: string;
  fieldExpressions?: (string | TableFieldExpr)[];
  parentTables?: ParentSpec[]; // (ParentSpec extends TableJsonSpec)
  childTables?: ChildSpec[];   // (ChildSpec extends TableJsonSpec)
  recordCondition?: RecordCondition;
}
```

#### `table`

The name of the top-level table for which this structure describes JSON output. Data from
other, related tables may be described via the members `parentTables` and `childTables` as
described below. The table name may appear unqualified if a `defaultSchema` has been specified
for the enclosing `QueryGroupSpec`. The table name may be entered with quotes in which case it
will be used in quoted form exactly as entered in query generation, or without quotes in which
case the database's default name case folding will be applied automatically (to uppercase for
Oracle and lowercase for Postgres). 

#### `fieldExpressions`

`fieldExpressions` lists the properties that come from fields of the top-level table named in `table`,
or from expressions formed from those fields. Each entry can either be a simple `string`, in which case
it should equal a column name of the top level table, or else a structure of type `TableFieldExpr`
which allows additional options to be specified for the output property.

```typescript
interface TableFieldExpr
{
  field?: string;
  expression?: string;
  jsonProperty?: string; // Required if value is not a simple field name.
  fieldTypeInGeneratedSource?: string | {[srcLang: string]: string};
  withTableAliasAs?: string; // Table alias escape sequence which may be used in value (default '$$').
}
```

- A simple `string` value is interpreted as a `TableFieldExpr` with the `field` property of that value and
no other properties provided.
 

- Exactly one of `field` and `expression` should be specified. In the `field` case the value comes directly
from a database column, while an `expression` may be any SQL expression involving the database fields in scope.
The expression should be entered just as it should appear in generated SQL, with the exception that `$$`
will be replaced with an alias to the table named in `table`, though usually qualification with `$$` is not
necessary.


- If `expression` is specified, then `fieldTypeInGeneratedSource` is required to assign a type
to the expression in generated source code. If only one target language (Java or TypeScript) is in use,
then the result type can be entered as a simple `string`. If multiple target languages are in use then
the result type can be supplied as an object mapping the target language to the result type declaration
for the expression in that language. For example: `{'TS': 'string', 'Java': 'String'}`.


- `jsonProperty` if provided determines the name of the property in the JSON object representing the
table row. If not specified, then the output property name is determined by the `propertyNameDefault`
value of the enclosing `QuerySpec` or `QueryGroupSpec` as described above, defaulting to `CAMELCASE`
if neither is found.

#### `parentTables`

The `parentTables` member of `TableJsonSpec` describes the contributions from parent tables of the table
named in `table` to the JSON output. The contribution from a single parent table is described by interface
`ParentSpec` which derives from `TableJsonSpec`. The subtype adds a few additional members to describe
the join, which are only occasionally necessary. It also adds a member controlling whether the fields from
the parent should be included "inline" or wrapped via a reference object as described below.

```typescript
interface ParentSpec extends TableJsonSpec
{
  referenceName?: string | undefined;
  alias?: string | undefined;
  customJoinCondition?: CustomJoinCondition;
  viaForeignKeyFields?: string[];
}
```

- If `referenceName` is provided for a parent table, then the value for a row of the parent will
be wrapped as a JSON object which is referenced via a property of this name in the child's JSON
object value. If a `referenceName` is not provided, then the contents from the parent table's JSON
output will be included directly ("inlined") into in the referencing table's JSON output. In
this case, the parent's own fields, child collections, and fields from its own parents will all
appear directly among the referencing table's own fields, child collections, and content from
other parent tables.


- The `alias` property allows assigning a custom alias for the parent table. This is not often
necessary, but it may be used in expressions provided in property `recordCondition` which is
described further below as a way of filtering records via custom conditions.


- At most one of `customJoinCondition` and `viaForeignKeyFields` can be specified, in both cases to
control how the join to the parent is accomplished from the table named in `table`. Normally neither
of these properties is needed, for the common case that there is one and only one foreign key between
the table named in `table` and the parent table as found in the database metadata. If neither property
is provided and no suitable foreign key is found, or more than one such foreign key is found, then
query generation will fail with an error.


- The `viaForeignKeyFields` option allows disambiguating when multiple foreign keys exist
between the child table (named in `table`) and the parent table, by listing the names of
the foreign key fields to be matched. The order doesn't matter for the foreign key fields
here, but they must exist as foreign key fields in the database metadata or else query
generation will fail with an error.


- The `customJoinCondition` allows matching via fields that do not have a foreign key constraint
defined in the database (metadata). The structure is a list of field pairs between the child and
parent tables that should be equated to form the join condition:

```typescript
interface CustomJoinCondition
{
  equatedFields: FieldPair[];
}

interface FieldPair
{
  childField: string;
  parentPrimaryKeyField: string;
}
```

#### `childTables`
TODO

#### `recordCondition`
TODO


## Setup
Refer to sqljson-query-dropin project docs, or copy them here.
