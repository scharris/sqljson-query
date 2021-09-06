# SQL/JSON-Query

## Overview

This is a tool to be used as part of an application's build process to generate
SQL/JSON nested data queries and matching result type declarations.

<img align="right" src="img/diagram-1.dot.svg" alt="source generation process diagram">


As a developer, your job in the process is to supply a file `query-specs.ts`
which provides a list of query specifications, where each specification describes a
hierarchy of data to be fetched for a query. From these query specifications and a
database metadata file (generated from a database via included tool), SQL/JSON-Query 
generates:
- SQL/JSON nested data queries for Oracle or Postgres to fetch the data
- Result type declarations in TypeScript or Java which match the structure of 
  the generated SQL and to which the query results can be directly deserialized
- Column-level metadata for all relations (tables/views) in TypeScript or Java, which
  can be used to refer to tables/columns in INSERT/UPDATE/DELETE statements in an
  error-resistant way


When generating queries, database metadata is used to verify all tables, fields, and
foreign key relationships used in the queries, failing with an error if any referenced
database items are not found in database metadata. A self-contained tool to fetch this
database metadata for Oracle and PostgresSQL databases is included.

The query generation work is all done at build time, and there is no run-time component
needed to use the generated SQL queries and generated result types. The SQL can be
executed by any preferred means, and deserialized to the generated result types using
any library suitable for the purpose, such as Jackson in Java, or via `JSON.parse()`
in TypeScript.

## Setup

The easiest way to enable query generation via SQL/JSON-Query is to clone the 
`sqljson-query-dropin` project from
[the sqljson-query-dropin repo](https://github.com/scharris/sqljson-query-dropin),
which contains a nearly ready-to-go form of the tool.

- Clone the dropin repository

  ```git clone https://github.com/scharris/sqljson-query-dropin query-gen```

  Here we've installed the tool in a directory named `query-gen` for definiteness, but
  you can name and position the folder however you want.


- Next, install dependencies needed by the tool in the `query-gen folder`:

  ```cd query-gen; npm i```

  This step only needs to be performed once to install npm dependencies.


- Generate database metadata
  
  Add a script or manually-triggered step to your build process to perform the following whenever
  database metadata needs to be updated to reflect changes in the database:
  ```
  mvn -f query-gen/dbmd/pom.xml compile exec:java "-DjdbcProps=<props>" "-Ddb=<pg|ora>"
  ```
  
  Here `<props>` is the path to a properties file with JDBC connection information for
  the database to be examined. The expected format of the jdbc properties file is:
  ```
  jdbc.driverClassName=...
  jdbc.url=...
  jdbc.username=...
  jdbc.password=...
  ```
  
  The above command will produce output file `query-gen/dbmd/dbmd.json` containing the database
  metadata, which is where the tool expects to find the metadata while generating queries. On
  first run of metadata generation, examine this file to make sure that the expected tables have
  been found by the metadata generator.
  
  To remove unwanted tables from database metadata generation, add an additional property
  definition `-Ddbmd.table.pattern=<regex>` to the `mvn` command to only include relations
  whose name matches the given regular expression. The pattern defaults to `^[^$].*`.


- Define application queries in TypeScript file `query-gen/queries/query-specs.ts`

  Edit the `query-specs.ts` file in `query-gen/queries` to define application queries, exporting
  a `QueryGroupSpec` instance as `queryGroupSpec`. The details of how to write query specifications
  are described in [the query specifications documentation](query-specifications.md). It may help
  to work through [the tutorial](tutorial.md) before consulting the detailed documentation first.
  Any tables, views and fields used in the queries must exist in the database metadata, so database
  metadata should be generated before proceeding to query generation.


- Generate SQL and result types:

  To generate SQL and matching Java result types:
  
  ```
  npm run --prefix query-gen generate-queries -- --sqlDir=../src/generated/sql --javaBaseDir=../src/generated/lib -javaQueriesPkg=gen.queries -javaRelMdsPkg=gen.relmds # --javaResultTypesHeader=...
  ```

  To generate SQL and matching TypeScript result types:
  
  ```
  npm run --prefix query-gen generate-queries -- --sqlDir=../src/generated/sql --tsQueriesDir=../src/generated/lib --tsRelMdsDir=../src/generated/lib --tsTypesHeader=queries/result-types-header-ts
  ```

  The java/tsTypesHeader parameters are not required, but can be used in case additional imports
  or comments are wanted at the top of the generated query result type files.


## Tutorial

[A tutorial](tutorial.md) is available which builds a working example for an example database schema.
It is recommended to review the tutorial before consulting the detailed query specifications
documentation.

## Query Specifications

If using the ready-made [project dropin](https://github.com/scharris/sqljson-query-dropin)
to add query generation capability to a project as described above, then you define your
single `QueryGroupSpec` object in file `<query-gen-folder>/queries/query-specs.ts`, and
export it from that module as `queryGroupSpec`.

```typescript
// (file query-specs.ts)
export const queryGroupSpec: QueryGroupSpec = {
   defaultSchema: "foos",
   generateUnqualifiedNamesForSchemas: ["foos"],
   propertyNameDefault: "CAMELCASE",
   querySpecs: [
     // <your query specifications here>
   ]
};
```

See [the tutorial](tutorial.md) and [the query specifications documentation](query-specifications.md)
for details of constructing the query specifications.
