# SQL/JSON-Query

## Overview
This is a tool to be used as part of an application's build process to generate
SQL/JSON nested data queries together with their matching result type declarations.
As a developer, your primary job in the process is to supply a file `query-specs.ts`
which provides a list of query specifications, where each specification describes a
hierarchy of data to be fetched for a query. From these query specifications and
some auto-generated database metadata, the tool will generate:
- SQL/JSON nested data queries for Oracle or Postgres to fetch the data, and
- Result type declarations in either TypeScript or Java, which match the
structure of the generated SQL and to which the query results can be deserialized.
- Column-level metadata for all relations (tables/views) in TypeScript or Java, which
  can be used to refer to tables/columns in INSERT/UPDATE/DELETE statements in an
  error-resistent way.

```
    dbmd (auto-generated from db)
     +
query-specs (supplied by programmer)
  (build time)
       ->               SQL files (Postgres or Oracle SQL/JSON)
       ->               Query result type definitions (TypeScript or Java)
```

When generating queries, database metadata is used to verify all tables, fields, and
foreign key relationships used in the queries. A self-contained tool to fetch this
metadata for Oracle and PostgresSQL databases is included.

Since the work is all done at build time, there is no run-time component for the tool.
The SQL can be executed by any preferred means, and deserialized to the generated
result types using any library suitable for the purpose, such as Jackson in Java,
or via `JSON.parse()` in TypeScript.

## Query Specification
A query is described via a TypeScript structure of type `QuerySpec`, which describes
how the data content of a given table and its related tables should be represented
in JSON format. The TableJsonSpec structure is the heart of the query specification,
and the `QuerySpec` nests `TableJsonSpec` structures to represent parent/child
relationships for related tables for which data is to be included.

```
  query-specs basic structure
      queryName
      *tableJson*
         table
         // optional list of fields from the table itself to be included in the json object for the table
         fieldExpressions
         // optional parent fields or references
         parentTables: [  [optional]
           {
             [referenceName] -- if not provided, fields are "inlined" with enclosing table's field expressions
             *tableJson*
           }
           ...
         ]
         // optional child collections
         childTables: [
           {
             collectionName
             *tableJson*
           }
           ...
         ]
```

## Setup
Refer to sqljson-query-dropin project docs, or copy them here.
