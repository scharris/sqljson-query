# SQL/JSON-Query

## Overview

This tool generates SQL queries to fetch nested data in JSON format from any number of related database tables,
and generates result type declarations that match each query's result structure. The generated SQL can then be
executed directly against the database without the need for any extra runtime libraries, yielding JSON, and the
results deserialized to the generated result types using any of the common libraries or facilities in your target
language for that purpose (e.g. Jackson for Java, or just JSON.parse() for TypeScript).

- Supported databases: **PostgreSQL**, **MySQL**, **Oracle**.
  (Postgres tested for v. 12+, some previous versions may also work; MySQL tested only at v.8; Oracle 19+ tested, 18 might work, but not <=12.2)

- Supported languages for result types: **TypeScript**, **Java**

## Process

<img align="right" src="img/diagram-1.dot.svg" alt="source generation process diagram">

For each of a set of TypeScript *query specifications* written by the developer, which describes a hierarchy of
related tables from which to fetch data, the tool:

- Generates a SQL query conforming to the [ISO SQL/JSON standard](https://www.iso.org/standard/78937.html),
   or the closest approximation supported by the database, which when executed will yield JSON data for the
   related tables via a single query execution.

- Generates the matching type declarations for the query results in either TypeScript or Java, to which the
   query results can be directly deserialized.

An advantage of using SQL/JSON aggregation functions, as found in the generated queries, is that it allows
us to efficiently pull data from multiple independent child hierarchies of any given parent table in a
single query, which is not achievable practically or efficiently via traditional joins. The downside of
SQL/JSON is that it's somewhat difficult and tedious to actually write these queries directly in SQL,
and more so to also create types to match the query result structures. This was the motivation for the
source generator: to make it easy to create the nested data SQL/JSON queries from a simple specification
and to auto-generate their result types at the same time.

When generating queries, database metadata is used to verify all tables, fields, and foreign key
relationships referenced in the query specifications, failing with an error if any such items are not
found in database metadata. A self-contained tool is included to fetch the database metadata for each
supported database.

As a developer, your primary job in the process is to supply a file `query-specs.ts` which provides a list
of query specifications, where each specification describes a hierarchy of data to be fetched for a query.
An example of the query specifications and generated sources follows.


## Example Inputs and Outputs

Let's look at example inputs and outputs to clarify what the tool does. For an actual follow-along
executable example, please see the [the tutorial](tutorial.md).


### Inputs

Out first "input" is the database itself, for which we'll use the example schema diagrammed below (which is
about clinical drugs). The database is used to generate database metadata in JSON form, which is needed by
the tool during source generation, both to verify references to database objects and to find foreign key
information for related tables in query specifications. Generally we would only generate database
metadata initially and then whenever the database has changes that we want to incorporate into our queries.

<img align="right" src="img/db-box.dot.svg" alt="database diagram">
<img src="img/drug-almost-all.svg" alt="all tables" style="width: 860px; height: 460px; margin-left:30px;">

<img align="right" src="img/query-spec-box.dot.svg" alt="query-specification">

The other input for the source generator is a set of query specifications. A query specification describes
how to form JSON output for each table, including how related table data is nested via parent/child table
relationships within a table's output. These query specifications are expressed in TypeScript, regardless of
target language, and are checked against database metadata whenever the tool is run. This checking ensures
validity of all references to database objects, including implicit reliance on foreign keys in parent/child
relationships.

In this example we supply a specification for a single drugs query, which fetches data from all tables in
the above diagram:

```typescript
const drugAdvisoriesReferencesQuery: QuerySpec = {
  queryName: 'drug advisories references query',
  tableJson: {
    table: 'drug',
    recordCondition: { sql: 'category_code = :catCode' },
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
            viaForeignKeyFields: ['entered_by'] // <- specified because there are two foreign keys to this parent
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

Given the inputs above, SQL/JSON-Query produces the following outputs:

1) <img align="right" src="img/sql-output-oval.dot.svg" alt="SQL files"> SQL files are generated and written
 to a specified output directory, for each query specification that was supplied. The SQL utilizes ISO
 standard SQL/JSON operators or their closest equivalent for the chosen type of database. For the query
 specification above the following SQL is produced:

```sql
-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
-- JSON_OBJECT_ROWS results representation for drug advisories references query
select
  jsonb_build_object(
    'drugName', d.name,
    'categoryCode', d.category_code,
    'primaryCompound', (
      select
        jsonb_build_object(
          'compoundId', c.id,
          'compoundDisplayName', c.display_name,
          'enteredByAnalyst', a."enteredByAnalyst"
        ) json
      from
        compound c
        -- parent table 'analyst', joined for inlined fields
        left join (
          select
            a.id as "_id",
            a.short_name "enteredByAnalyst"
          from
            analyst a
        ) a on c.entered_by = a."_id"
      where (
        d.compound_id = c.id
      )
    ),
    'advisories', (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'advisoryTypeId', a.advisory_type_id,
          'advisoryText', a.text,
          'advisoryTypeName', at_."advisoryTypeName",
          'advisoryTypeAuthorityName', at_."advisoryTypeAuthorityName"
        )),'[]'::jsonb) json
      from
        advisory a
        -- parent table 'advisory_type', joined for inlined fields
        left join (
          select
            at_.id as "_id",
            at_.name "advisoryTypeName",
            -- field(s) inlined from parent table 'authority'
            a."advisoryTypeAuthorityName"
          from
            advisory_type at_
            -- parent table 'authority', joined for inlined fields
            left join (
              select
                a.id as "_id",
                a.name "advisoryTypeAuthorityName"
              from
                authority a
            ) a on at_.authority_id = a."_id"
        ) at_ on a.advisory_type_id = at_."_id"
      where (
        a.drug_id = d.id
      )
    ),
    'prioritizedReferences', (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'priority', dr.priority,
          'publication', r.publication
        ) order by priority asc),'[]'::jsonb) json
      from
        drug_reference dr
        -- parent table 'reference', joined for inlined fields
        left join (
          select
            r.id as "_id",
            r.publication as publication
          from
            reference r
        ) r on dr.reference_id = r."_id"
      where (
        dr.drug_id = d.id
      )
    )
  ) json
from
  drug d
where (
  (category_code = :catCode)
)
```

2) <img align="right" src="img/result-types-oval.dot.svg" alt="result types"> A TypeScript or Java source
 code file is generated for each query, which declares the result types for the objects appearing in the
 query results of the generated SQL for the query. The JSON value from each result row can be
 directly deserialized to the first result type declared in this file. For our example query specification,
 the following TypeScript source file is generated (Java source would be similar).

```typescript
export const sqlResource = "drug-advisories-references-query.sql";

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

For a step-by-step guide to setting up the tool and progressively building and executing queries like
the above against an actual example database, see [the tutorial](tutorial.md).

## Setup

The following is a brief overview of what's involved in using the tool. It's recommended to work through
or at least to review [the tutorial](tutorial.md) to see a stepwise guide through a working example,
which will provide more details.

### Setup the tool folder

Clone from [the sqljson-query-dropin repo](https://github.com/scharris/sqljson-query-dropin) which
contains a ready-to-go form of the tool:

```git clone https://github.com/scharris/sqljson-query-dropin query-gen```

Here we've installed the tool in a directory named `query-gen` but you can name and position the
folder however you like &mdash; just adjust commands accordingly below.

Install the dependencies for the tool via npm:

```console
cd query-gen
npm i && tsc
```

### Generate database metadata

Create a properties file containing connection information for your database, with the format depending
on the type of your database:

- Postgres

  ```console
  PGHOST=...
  PGDATABASE=...
  PGUSER=...
  PGPASSWORD=...
  PGPORT=...
  ```

- MySQL

  ```console
  MYSQL_HOST=...
  MYSQL_PORT=...
  MYSQL_USER=...
  MYSQL_PASSWORD=...
  MYSQL_DATABASE=...
  ```

- Oracle

  ```console
  jdbc.driverClassName=...
  jdbc.url=...
  jdbc.username=...
  jdbc.password=...
  ```

Then generate the database metadata:

```console
  # in query-gen/
  npx gen-dbmd --connProps <conn-props> --db <pg|mysql|hsql|ora> --outputDir <dir>
```

where `conn-props` is the connection properties file created above, and the second argument represents
your database type.

Note: For an Oracle database, Maven and Java are used to fetch database metadata, but the Java/Maven
dependency can be easily avoided. See
[Generating Database Metadata without Maven and Java](#generating-database-metadata-without-maven-and-java)
below if you want to generate database metadata without those dependencies.

The generated database metadata files are `dbmd.json` and `relations-metadata.ts`.

### Define application query specifications

Edit the included file `gen-queries.ts` in directory `query-gen/` to define application queries.

```typescript
// (file <query-gen-folder>/query-specs.ts)
export const queryGroupSpec: QueryGroupSpec = {
    defaultSchema: "foos",
    generateUnqualifiedNamesForSchemas: ["foos"],
    propertyNameDefault: "CAMELCASE",
    querySpecs: [
      // <your query specifications here>
    ]
};
```

The details of how to write query specifications are described in the [the tutorial](tutorial.md) and
further in [the query specifications documentation](query-specifications.md). It is recommended to work
through the tutorial before consulting the detailed documentation.


### Generate SQL and result types:

To generate SQL and matching TypeScript result types:

```console
# in query-gen/
tsc && node gen-queries.js --dbmd dbmd.json --sqlDir sql --tsDir ts
```

This will generate the SQL and TypeScript sources for your queries in the directories you specify for
the `sqlDir` and `tsDir` arguments.

Or for Java result types instead:

```console
# in query-gen/
tsc && node gen-queries.js --dbmd dbmd.json --sqlDir src/sql --javaBaseDir src/generated --javaQueriesPkg my.pkg
```

## Tutorial

[A tutorial](tutorial.md) is available which builds a working example for an example database schema.
It is recommended to review the tutorial before consulting the detailed
[query specifications documentation](query-specifications.md).

## Example Application

A small example app using SQL/JSON-Query with NodeJs/TypeScript and a Postgres database is available at:

[SQL/JSON-Query example app](https://github.com/scharris/sqljson-query-example-pg)

Setup instructions are available in the README of that repository.

### Generating Database Metadata without Maven and Java

For Oracle database, the command in [Generate Database Metadata](#generate-database-metadata) above
depend on Maven and Java being installed on your system. If you don't want to use Maven and Java, then
it's easy to generate the database metadata without them. There are two database metadata files which
need to be generated.

- First generate the primary database metadata, `dbmd.json`, by executing the
  [SQL database metadata query](https://github.com/scharris/sqljson-query/tree/main/src/dbmd/generation/src/main/resources)
  for your database type, by whatever means you prefer to execute queries for your database. The query
  has two parameters, `relIncludePat` and `relExcludePat`, which are regular expressions for table names
  to be included and excluded, respectively. If you just want all tables to be included in the metadata,
  then pass (or textually replace) '.*' for `relIncludePat` and '^$' `relExcludePat`. Save the resulting
  single json value to file `dbmd.json` in folder `query-gen`.

- Next generate the additional "relations" metadata which is derived from the main metadata generated
  above. This is done via the command:

   ```console
   # (in query-gen/)
   npx gen-relsmd --dbmd dbmd.json --tsDir .
   ```

   This command depends on the primary database metadata already existing, so these steps need to be
   run in the order above. This command should produce a metadata file at `relations-metadata.ts`.


## End Note &mdash; What about data modification statements?

Though SQL/JSON-Query is only intended to provide a *query* capability, some other libraries and frameworks
that support querying (e.g. most object relational mapping tools) do also provide support for INSERT,
UPDATE and DELETE statements in some form. So the question arises, what to do about the need for these
statements? Our generated SQL statements are checked for validity against the database schema at compile time,
but don't cover modification statements. Are we to be thrown back to building raw SQL for data modification
statements, without compile time checks of the tables and fields referenced? Or would we have to include
another library for the purpose?

One light-weight solution to this is shown here. The idea is for the developer to write the data-modifying
SQL statements, but to use the relations metadata already made available by SQL/JSON-Query for referencing
all table and field names. This gives us compile-time verification of the table and field names used in the
data modification statements. It is the same technique used to obtain compile-time verification of filter
conditions shown at
[the end of the tutorial](tutorial.md#validating-database-object-names-in-free-form-expressions).

Here's an example pulled from the
[SQL/JSON-Query example app](https://github.com/scharris/sqljson-query-example-pg) (at `src/app.ts`),
showing an insert statement with referenced field and table names being verified at compile time:

```typescript
import {Schema_drugs as drugsSchema} from './generated/lib/relations-metadata';
import {verifiedFieldNames, verifiedTableName} from './tables-fields-verification';

async function createDrug(data: DrugData, pgClient: PgClient): Promise<void>
{
  // Check at compile time the table and field names to be used against database schema information.
  const drug = verifiedTableName(drugsSchema, "drug");
  const {id, name, compound_id, category_code, descr, registered_by} = verifiedFieldNames(drugsSchema.drug);

  const res = await pgClient.query(
    `insert into ${drug}(${id}, ${name}, ${compound_id}, ${category_code}, ${descr}, ${registered_by}) ` +
    "values($1, $2, $3, $4, $5, 1)",
    [data.id, data.name, data.compoundId, data.category, data.description]
  );

  if (res.rowCount !== 1)
    throw new Error('Expected one row to be modified when creating drug.');
}
```

Here `verifiedFieldNames` and `verifiedTableName` are
[small utility functions](https://github.com/scharris/sqljson-query-example-pg/blob/main/src/tables-fields-verification.ts),
defined in the example app.
