# SQL/JSON-Query

## Overview

Generate SQL nested data queries which gather results from any number of related tables in
JSON format via single query executions using SQL/JSON operators. Also generates for each 
query the matching type declarations for the query results in either TypeScript or Java.
Supports PostgreSQL, Oracle, MySQL databases. This is intended to be a build-time tool,
it doesn't have (and doesn't need) any runtime component.

<img align="right" src="img/diagram-1.dot.svg" alt="source generation process diagram">

As a developer, your job in the process is to supply a file `query-specs.ts`
which provides a list of query specifications, where each specification describes a
hierarchy of data to be fetched for a query. From these query specifications and a
database metadata file (auto-generated from a database via included tool), the
SQL/JSON-Query tool generates:
- SQL queries compliant with the SQL/JSON standard (or the closest approximation supported
  by the database) for fetching nested data, for PostgreSQL, MySQL and Oracle databases
- Result type declarations in TypeScript or Java, defining the structure of the objects
  appearing in result sets for the generated SQL, and to which the query results can be
  directly deserialized

When generating queries, database metadata is used to verify all tables, fields, and
foreign key relationships used in the queries, failing with an error if any referenced
database items are not found in database metadata. A self-contained tool to fetch this
database metadata for PostgresSQL, MySQL, and Oracle databases is included.

The query generation work is all done at build time, and there is no run-time component
needed to use the generated SQL queries and generated result types. The SQL can be
executed by any preferred means, and deserialized to the generated result types using
your whatever you like to use for that purpose, such as Jackson for Java, or via `JSON.parse()`
in TypeScript.

## Example Inputs and Outputs

Let's look at example inputs and outputs to clarify what the tool does. For an actual follow-along
executable example, see the [the tutorial](tutorial.md).

For the given example database diagrammed below, containing information about clinical drugs, we would first
use the tool to generate database metadata. Generally we would only generate database metadata initially, and
then again whenever the database has changes that we want to incorporate into our queries.

### Inputs
<img align="right" src="img/db-box.dot.svg" alt="database diagram">
<img src="img/drug-almost-all.svg" alt="all tables" style="width: 860px; height: 460px; margin-left:30px;">

<img align="right" src="img/query-spec-box.dot.svg" alt="query-specification">

Next we supply specifications for our queries. A query specification describes how to form JSON output for
each table and how related table data is nested via parent/child table relationships. These are expressed in
TypeScript and they are checked at query-generation time (during the app build, usually) against the database
metadata. This checking ensures validity of all references to database objects, including implicit reliance
on foreign keys in parent/child relationships. 

In this example we supply a specification for a single drugs query, which fetches data from all tables in the
diagram above:

```typescript
const drugAdvisoriesReferencesQuery: QuerySpec = {
  queryName: 'drug advisories references query',
  tableJson: {
    table: 'drug',
    recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
    fieldExpressions: [
      { field: 'name', jsonProperty: 'drugName' },
      'category_code',
    ],
    parentTables: [
      {
        referenceName: 'primaryCompound',
        table: 'compound',
        fieldExpressions: [
          { field: 'id', jsonProperty: 'compoundId' },
          { field: 'display_name', jsonProperty: 'compoundDisplayName' },
        ],
        parentTables: [
          {
            table: 'analyst',
            fieldExpressions: [
              { field: 'short_name', jsonProperty: 'enteredByAnalyst' }
            ],
            viaForeignKeyFields: ['entered_by'] // <- select on of two foreign keys to analyst
          },
        ]
      },
    ],
    childTables: [
      {
        collectionName: 'advisories',
        table: 'advisory',
        fieldExpressions: [
          'advisory_type_id',
          { field: 'text', jsonProperty: 'advisoryText' },
        ],
        parentTables: [
          {
            table: 'advisory_type',
            fieldExpressions: [ { field: 'name', jsonProperty: 'advisoryTypeName' } ],
            parentTables: [
              {
                table: 'authority',
                fieldExpressions: [ { field: 'name', jsonProperty: 'advisoryTypeAuthorityName' } ]
              }
            ]
          }
        ]
      },
      {
        collectionName: 'prioritizedReferences',
        table: 'drug_reference',
        fieldExpressions: [ 'priority' ],
        parentTables: [
          {
            table: "reference",
            fieldExpressions: [ 'publication' ]
          }
        ],
        orderBy: 'priority asc'
      }
    ]
  }
};
```

### Outputs
The tool produces the following outputs:

1) <img align="right" src="img/sql-output-oval.dot.svg" alt="SQL files"> SQL files are generated and written
to a specified output directory, for each query specification that was supplied. The SQL utilizes ISO standard
SQL/JSON operators or their closest equivalent for the chosen type of database:

```sql
select
  -- row object for table 'drug'
  jsonb_build_object(
    'drugName', q."drugName",
    'categoryCode', q."categoryCode",
    'primaryCompound', q."primaryCompound",
    'advisories', q.advisories,
    'prioritizedReferences', q."prioritizedReferences"
  ) json
from (
  -- base query for table 'drug'
  select
    d.name "drugName",
    d.category_code "categoryCode",
    -- parent table 'compound' referenced as 'primaryCompound'
    (
      select
        -- row object for table 'compound'
        jsonb_build_object(
          'compoundId', q."compoundId",
          'compoundDisplayName', q."compoundDisplayName",
          'enteredByAnalyst', q."enteredByAnalyst"
        ) json
      from (
        -- base query for table 'compound'
        select
          c.id "compoundId",
          c.display_name "compoundDisplayName",
          -- field(s) inlined from parent table 'analyst'
          q."enteredByAnalyst" "enteredByAnalyst"
        from
          compound c
          -- parent table 'analyst', joined for inlined fields
          left join (
            select
              a.id "_id",
              a.short_name "enteredByAnalyst"
            from
              analyst a
          ) q on c.entered_by = q."_id"
        where (
          d.compound_id = c.id
        )
      ) q
    ) "primaryCompound",
    -- records from child table 'advisory' as collection 'advisories'
    (
      select
        -- aggregated row objects for table 'advisory'
        coalesce(jsonb_agg(jsonb_build_object(
          'advisoryTypeId', q."advisoryTypeId",
          'advisoryText', q."advisoryText",
          'advisoryTypeName', q."advisoryTypeName",
          'advisoryTypeAuthorityName', q."advisoryTypeAuthorityName"
        )),'[]'::jsonb) json
      from (
        -- base query for table 'advisory'
        select
          a.advisory_type_id "advisoryTypeId",
          a.text "advisoryText",
          -- field(s) inlined from parent table 'advisory_type'
          q."advisoryTypeName" "advisoryTypeName",
          q."advisoryTypeAuthorityName" "advisoryTypeAuthorityName"
        from
          advisory a
          -- parent table 'advisory_type', joined for inlined fields
          left join (
            select
              at.id "_id",
              at.name "advisoryTypeName",
              -- field(s) inlined from parent table 'authority'
              q."advisoryTypeAuthorityName" "advisoryTypeAuthorityName"
            from
              advisory_type at
              -- parent table 'authority', joined for inlined fields
              left join (
                select
                  a.id "_id",
                  a.name "advisoryTypeAuthorityName"
                from
                  authority a
              ) q on at.authority_id = q."_id"
          ) q on a.advisory_type_id = q."_id"
        where (
          a.drug_id = d.id
        )
      ) q
    ) as advisories,
    -- records from child table 'drug_reference' as collection 'prioritizedReferences'
    (
      select
        -- aggregated row objects for table 'drug_reference'
        coalesce(jsonb_agg(jsonb_build_object(
          'priority', q.priority,
          'publication', q.publication
        ) order by priority asc),'[]'::jsonb) json
      from (
        -- base query for table 'drug_reference'
        select
          dr.priority as priority,
          -- field(s) inlined from parent table 'reference'
          q.publication as publication
        from
          drug_reference dr
          -- parent table 'reference', joined for inlined fields
          left join (
            select
              r.id "_id",
              r.publication as publication
            from
              reference r
          ) q on dr.reference_id = q."_id"
        where (
          dr.drug_id = d.id
        )
      ) q
    ) "prioritizedReferences"
  from
    drug d
  where (
    (category_code = :catCode)
  )
) q
```

2) <img align="right" src="img/result-types-oval.dot.svg" alt="result types"> A TypeScript or Java source code file
   is generated for each query, which declares the result types for the objects appearing in the query results of
   the generated SQL for the query. The JSON value from each result row can be directly deserialized to the first
   result type declared in this file.

```typescript
// The types defined in this file correspond to results of the following generated SQL queries.
export const sqlResource = "drug-advisories-references-query.sql";

// query parameters
export const catCodeParam = 'catCode';

// Below are types representing the result data for the generated query, with top-level type first.
export interface Drug
{
  drugName: string;
  categoryCode: string;
  primaryCompound: Compound;
  advisories: Advisory[];
  prioritizedReferences: DrugReference[];
}

export interface Compound
{
  compoundId: number;
  compoundDisplayName: string | null;
  enteredByAnalyst: string;
}

export interface Advisory
{
  advisoryTypeId: number;
  advisoryText: string;
  advisoryTypeName: string;
  advisoryTypeAuthorityName: string;
}

export interface DrugReference
{
  priority: number | null;
  publication: string;
}
```

For a step-by-step guide to setting up the tool and progressively building and executing queries like the above
against an actual example database, see [the tutorial](tutorial.md).

## Setup

The easiest way to enable query generation via SQL/JSON-Query is to clone the 
`sqljson-query-dropin` project from
[the sqljson-query-dropin repo](https://github.com/scharris/sqljson-query-dropin),
which contains a nearly ready-to-go form of the tool.

- Clone the dropin repository

  ```git clone https://github.com/scharris/sqljson-query-dropin query-gen```

  Here we've installed the tool in a directory named `query-gen` for definiteness, but
  you can name and position the folder however you want.


- Next, install dependencies needed by the tool in the `query-gen` folder:

  ```(cd query-gen && npm i)```

  This step only needs to be performed once to install npm dependencies.


- Generate database metadata
  
  Add a script or manually-triggered step to your build process to perform the following whenever
  database metadata needs to be updated to reflect changes in the database:
  ```console
  query-gen/generate-dbmd.sh <jdbc-props> <pg|mysql|ora>
  ```
  A PowerShell variant of the script taking the same parameters is also available, for Windows users. 
  
  Here `<jdbc-props>` is the path to a properties file with JDBC connection information for
  the database to be examined. The expected format of the jdbc properties file is:
  ```
  jdbc.driverClassName=...
  jdbc.url=...
  jdbc.username=...
  jdbc.password=...
  ```

  The database metadata files are generated at `query-gen/dbmd/dbmd.json` and
  `query-gen/dbmd/relations-metadata.ts`, which is where the tool expects to find them when generating
  queries. On first run of metadata generation, examine the `dbmd.json` file to make sure that the
  expected tables have been found by the metadata generator.
  
  
- Define application queries in TypeScript file `query-gen/queries/query-specs.ts`

  Edit the `query-specs.ts` file in `query-gen/queries` to define application queries, which should
  export a `QueryGroupSpec` instance as `queryGroupSpec`. The details of how to write query specifications
  are described in [the query specifications documentation](query-specifications.md). It is recommended 
  to work through [the tutorial](tutorial.md) before consulting the detailed documentation.
  Any tables, views and fields used in the queries must exist in the database metadata, so database
  metadata should be generated before proceeding to query generation.


- Generate SQL and result types:

  To generate SQL and matching Java result types:
  
  ```
  npm run --prefix query-gen generate-queries -- --sqlDir=../src/generated/sql --javaBaseDir=../src/generated/lib --javaQueriesPkg=gen.queries
  ```

  Or to generate SQL and matching TypeScript result types:
  
  ```
  npm run --prefix query-gen generate-queries -- --sqlDir=../src/generated/sql --tsQueriesDir=../src/generated/lib
  ```


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
