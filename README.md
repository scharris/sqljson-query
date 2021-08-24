# SQL/JSON-Query

## Overview

This is a tool to be used as part of an application's build process to generate
SQL/JSON nested data queries and matching result type declarations.

<img align="right" src="img/diagram-1.svg">


As a developer, your job in the process is to supply a file `query-specs.ts`
which provides a list of query specifications, where each specification describes a
hierarchy of data to be fetched for a query. From these query specifications and a
database metadata file (generated from a database via included tool), the tool
generates:
- SQL/JSON nested data queries for Oracle or Postgres to fetch the data,
- Result type declarations in TypeScript or Java which match the structure of 
  the generated SQL and to which the query results can be directly deserialized.
- Column-level metadata for all relations (tables/views) in TypeScript or Java, which
  can be used to refer to tables/columns in INSERT/UPDATE/DELETE statements in an
  error-resistant way.


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

```typescript
interface QueryGroupSpec
{
  defaultSchema?: string;
  propertyNameDefault?: PropertyNameDefault;
  generateUnqualifiedNamesForSchemas: string[];
  querySpecs: QuerySpec[];
}
```
### Properties

- `defaultSchema`

  Any unqualified table or view referenced in a query specification is assumed to
  belong to the default schema specified here. This allows table/view references to be
  unqualified in query definitions for convenience and readability, while also allowing
  the query generator to precisely find the relation in the database metadata, where
  relations are stored in fully qualified form.


- `propertyNameDefault`

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
  

- `generateUnqualifiedNamesForSchemas`

  This setting determines which relation names are qualified in generated SQL. Any relation
  belonging to a schema in this list will be referred to in unqualified form in generated SQL.
  Your ability to use unqualified names in generated SQL depends on how your application connects
  to your database to execute the generated SQL. Generally if you connect to a schema directly
  (as with Oracle) or have it on a schema search path (if supported by your database such as
  with Postgres), then you should be able to add your schema in this list to generated unqualified
  names in your SQL. If you don't care how the generated SQL looks then it's always safe to leave
  this list empty.


- `querySpecs`

  These are the specifications for the SQL/JSON nested data queries to be generated for your
  application. Result types in either TypeScript or Java are also generated from these.
  The specifics of the query specifications are described in detail below.

### Usage example for `QueryGroupSpec`

If using the ready-made [project dropin](https://github.com/scharris/sqljson-query-dropin)
to add query generation capability to a project, then you define your single `QueryGroupSpec`
object in file `<query-gen-folder>/queries/query-specs.ts`, and export it from that module
as `queryGroupSpec`.

```typescript
export const queryGroupSpec: QueryGroupSpec = {
   defaultSchema: "foos",
   generateUnqualifiedNamesForSchemas: ["foos"],
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
one TypeScript module and Java class representing result types for the query. A query specification
is described via the `QuerySpec` interface.

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

### Properties

- `queryName`

  This required field defines a name of the given query, which can be several words separated
  by spaces, dashes, or underscores, such as "drugs with cautions and functional categories query".
  The query name should be unique in the `QueryGroupSpec` and is used to form the names of the
  generated SQL files, as well as the module name or class name for generated TypeScript or Java
  sources representing the query result types. SQL file names and TypeScript module names are
  based on the dashed form of the tokenized query name, for example
  `drugs-with-cautions-and-functional-categories-query.sql/ts` for the query name above. The Java
  class name containing result type definitions is the camelcase form of the query name, for
  example `DrugsWithCautionsAndFunctionalCategoriesQuery`.


- `tableJson`

  This required field is the heart of the query definition, specifying a top table and nested
  related tables, recursively, with details about how to convert each to JSON format. This
  structure is described in detail below.


- `resultRepresentations`

  Contains from one to three SQL variants to be generated for the query. Each variant will be
  written to its own SQL file, with variant type appended to the query name if multiple variants
  are selected. The result representation variants differ in how the results are presented
  in database result sets. Any subset of the following variants may be chosen.

  * `JSON_OBJECT_ROWS`(**default**): The result set will consist of multiple rows, with one row
  per result row from the top table in the hierarchy of results. Each row consists of exactly
  one column, which contains the JSON object representation of the hierarchy of data for the
  top-level table row and its related data from related tables.

  * `JSON_ARRAY_ROW`: In this result style the query will yield only a single row, which consists
  of only one column. The entire result set in this case is represented as a single JSON array
  value, the elements of which are JSON objects representing the result rows from the top table
  and data related to the row from the related tables.

  * `MULTI_COLUMN_ROWS`: The result set will consist of multiple rows, with one row per
  result row from the top table in the hierarchy of results. Top level rows are presented in
  multi-column form as in the top level table itself. The column values themselves may be
  either database types coming directly from a table or JSON objects representing data
  collected from related tables.


- `generateResultTypes`

  Controls whether Java or TypeScript source code representing result types for the query should be generated.
  The default value is `true`.


- `generateSource`

  If `false`, no SQL nor Java or TypeScript source will be generated.
  The default value is `true`.


- `propertyNameDefault`

  Controls how JSON property names are derived from database field names for
  this specific query, overriding any setting at the level of the `QueryGroupSpec`.
  See the description of the field of the same name in `QueryGroupSpec` for details.
  Defaults to `CAMELCASE` if defined in neither the `QuerySpec` nor the `QueryGroupSpec`.


- `orderBy`

  This optional property is a SQL expression controlling the ordering of the results
  from the top-level table in the query.


- `forUpdate`

  If `true`, a `for update` clause will be added to the generated SQL, causing the fetched
  rows to be locked for the duration of the transaction in which the query occurs.


- `typesFileHeader`

  Optional text which will be included above the generated Java or TypeScript result type definitions.
  This text is not interpreted by the tool and will be included verbatim in the generated source code,
  just below standard imports if any. Often this is used to add imports for types referred to in
  customized field result types.


## Table JSON Specification

The `TableJsonSpec` structure describes how selected parts of or expressions involving the data content
of a given table and related tables should be represented in JSON format. TableJsonSpec is the heart
of the query specification, where it describes how to form JSON output for the top table which is the
subject of the query. The structure also describes how data for related tables is to be included via
nested `TableJsonSpec` in the `parentTables` and `childTables` members of the `TableJsonSpec`, and so
on recursively to any level of nesting required through related tables.

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

### Properties

- `table`

  The name of the top-level table for which this structure describes JSON output. Data from
  other, related tables may be described via the members `parentTables` and `childTables` as
  described below. The table name may appear unqualified if a `defaultSchema` has been specified
  for the enclosing `QueryGroupSpec`. The table name may be entered with quotes in which case it
  will be used in quoted form exactly as entered in query generation, or without quotes in which
  case the database's default name case folding will be applied automatically (to uppercase for
  Oracle and lowercase for Postgres). 


- `fieldExpressions`

  Lists the properties that come from fields of the top-level table named in `table`, or from expressions
  formed from those fields. Each entry can either be a simple `string`, in which case it should equal a
  column name of the top level table, or else a structure of type `TableFieldExpr` which allows additional
  options to be specified for the output property.

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
  will be replaced with an alias to the table named in `table`. Usually qualification with `$$` is not
  necessary.

  - If `expression` is specified, then `fieldTypeInGeneratedSource` is required to assign a type
  to the expression in generated source code. If only one target language (Java or TypeScript) is in use,
  then the result type can be entered as a simple `string`. If multiple target languages are in use then
  the result type can be supplied as an object mapping the target language to the result type declaration
  for the expression in that language. For example: `{'TS': 'string', 'Java': 'String'}`.

  - If `jsonProperty` is provided, it determines the name of the property in the JSON object representing
  the table row. If not specified, then the output property name is determined by the `propertyNameDefault`
  value of the enclosing `QuerySpec` or `QueryGroupSpec` as described above, defaulting to `CAMELCASE`
  if neither is found.

  - Field Expressions Example
    ```typescript
      fieldExpressions: [
         'account_num',  // equiv to { field: 'account_num', jsonProperty: 'accountNum' } under default CAMELCASE property naming
         {field: 'id', jsonProperty: 'accountId'}, // specify custom property name
         {expression: 'select name from state where code = $$.state_code', fieldTypeInGeneratedSource: 'String'}
      ]
    ```

- `parentTables`

  The `parentTables` member of `TableJsonSpec` scribes the contributions from parent tables of the table
  named in `table` to the JSON output. Each element of the array is a `TableJsonSpec`, and may also include
  additional options particular to the parent/child relationship. A parent specification can describe
  an *inline* parent table, whose fields are merged into the child table's, or else a *referenced* parent
  table whose row value is included as a JSON object via a property in the child. Additional members are
  provided for controlling how the parent table is joined with the child table.
  See the [Parent Table Specification](#parent-spec) section below for details.


- `childTables`

  Each item of the `childTables` member of `TableJsonSpec` describes a property to be added to the
  parent JSON to hold a collection of records from a single child table. Each element of the array is
  a `TableJsonSpec`, with additional options particular to the child/parent relationship.
  See the [Child Table Specification](#child-spec) section below for details.


- `recordCondition`

  The optional `recordCondition` member can hold an arbitrary SQL predicate (suitable for inclusion
  in a SQL `WHERE` clause) to filter records in the subject table of the `TableJsonSpec` as named in
  `table`. The record condition should conform to the `RecordCondition` interface.

  ```typescript
  interface RecordCondition
  {
    sql: string;
    paramNames?: string[];
    withTableAliasAs?: string;
  }
  ```
  
  - The `sql` property holds the SQL predicate expression, just as it would appear in a SQL `WHERE` clause.
    Within the expression, usages of `$$` will be expanded to be the alias of the subject table in the
    generated query, unless the alias placeholder has been customized via the `withTableAlias` property in
    which case that character sequence will be expanded to the table alias instead. The SQL expression may
    contain parameters such as `:myParam` or `?`, in which case it is the responsibility of the program
    executing the SQL to set the parameters properly where the SQL is finally executed. Complex expressions
    involving boolean conjunctions and parentheses to nest conditions are allowed here.

  - The `paramNames` member, if provided, informs the query generator of any parameters that are used in
    the `sql` member, in which case it will helpfully add members or defined constants to the Java or
    TypeScript source code containing the parameter names. This is a convenience for the users of the SQL
    to assist with auto-completion and to prevent usage of wrong or missing parameter names, and is in no
    case required to properly execute the SQL.
  
  - The `withTableAlias` member controls the text that will be expanded to the subject table alias in
    the SQL expression in the `sql` property. Defaults to `$$`. Usually unqualified field names are
    unambiguous so no table alias is necessary.
    
    
## <a id="parent-spec"></a>Parent Table Specification

Parent table specifications appear in the `parentTables` member of the `TableJsonSpec`, where they
describe the contributions from parent tables of the table named in `table` to the JSON output.
The contribution from a single parent table is described by interface `ParentSpec` which derives from
`TableJsonSpec`. The subtype adds a few additional members to describe the join, which are only
occasionally necessary, and also adds a member controlling whether the fields from the parent
should be included *inline* with the child table's own field expressions, or else wrapped via a
single object reference property.


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
output will be included directly, *inlined*, into in the referencing table's JSON output. In
the inlined fields case, ie. when `referenceName` is not provided, the parent's own fields,
child collections, and fields from its own parents will all appear directly among the referencing
table's own fields, child collections, and content from other parent tables.


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
  For example:
  ```typescript
      parentTables: [
        {
          table: 'foo',
          // ...
          customJoinCondition: {equatedFields: [{childField: 'fooId', parentPrimaryKeyField: 'id'}]}
        }
      ]
  ```

## <a id="child-spec"></a>Child Table Specification

TODO


```typescript
interface ChildSpec extends TableJsonSpec
{
  collectionName: string;
  foreignKeyFields?: string[];
  customJoinCondition?: CustomJoinCondition;
  filter?: string;
  unwrap?: boolean;
  orderBy?: string;
}
```

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
  
  For example:
  ```typescript
    {
      table: 'bar',
      // ...
      childTables: [
        {
          collectionName: "foos",
          table: 'foo',
          // ...
          // (This custom join condition is not necessary if a proper foreign key constraint is defined on barId.)
          customJoinCondition: {equatedFields: [{childField: 'barId', parentPrimaryKeyField: 'id'}]}
        }
      ]
    }
  ```


TODO: Explain how to use a child table with inline parent to represent data from a many-many relationship.


## Setup
Refer to sqljson-query-dropin project docs, or copy them here.
