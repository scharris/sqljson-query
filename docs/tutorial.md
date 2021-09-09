# SQL/JSON-Query TUTORIAL

## Prerequisites
- [NodeJS 14+](https://nodejs.org/en/)
- [Java JDK 11+](https://jdk.java.net) &dagger;
- [Apache Maven 3.6+](https://maven.apache.org/download.cgi) &dagger;

Make sure that Maven's `mvn` is on your path and `JAVA_HOME` is defined to point to your JDK11+
installation directory. From the node installation, `npm` needs to be on your path as well.

&dagger; NOTE: The Java and Maven dependencies can be dispensed with, if you arrange other means of executing
the [database metadata query](https://github.com/scharris/sqljson-query-dropin/tree/main/dbmd/src/main/resources)
for your database type and the saving of its results to `query-gen/dbmd/dbmd.json`. The query has one parameter
`relPat` which is a regular expression for table names to be included (you can pass '.*' or adjust to suit).
The Maven project simply executes this query with a default for `relPat` and saves the results to file.

## Project Directory Setup

Let's create a directory for our query generation experiments.
```
mkdir sjq-example
cd sjq-example
```

Now we will install the query-generator by cloning the "sqljson-query-dropin" repository, and
initialize it via `npm`:
```
git clone https://github.com/scharris/sqljson-query-dropin.git query-gen

(cd query-gen && npm i)
```

Here we've installed the query generator in subdirectory `query-gen`, but it can be put anywhere,
so long as commands below are adjusted accordingly.

## Database Setup

Next we'll setup a small Postgres database for our example. We'll assume a Postgres server is
installed on the local machine and listening on localhost port 5432.

Create the Postgres database and user using your Postgres admin user login:
```
# ( "psql -U postgres template1" or similar admin login )
create user drugs with password 'drugs';
create database drugs owner drugs;
\q
```

Logging in as the new Postgres user `drugs` to the database created above, and create the database objects:
```sql
# ( psql -U drugs )

create table analyst (
  id int not null constraint analyst_pk primary key,
  short_name varchar(50) not null
);

create table compound
(
  id int not null constraint compound_pk primary key,
  display_name varchar(50),
  smiles varchar(2000),
  cas varchar(50),
  entered_by int not null constraint compound_enteredby_analyst_fk references analyst,
  approved_by int constraint compound_approvedby_analyst_fk references analyst
);

create table drug
(
  id int not null constraint drug_pk primary key,
  name varchar(500) not null constraint drug_name_un unique,
  compound_id int not null constraint drug_compound_fk references compound,
  mesh_id varchar(7) constraint drug_meshid_un unique,
  cid int,
  category_code varchar(1) not null,
  descr varchar(500),
  registered timestamp with time zone,
  registered_by int not null constraint drug_analyst_fk references analyst
);

create index drug_compoundid_ix on drug (compound_id);

create table reference
(
  id int not null constraint reference_pk primary key,
  publication varchar(2000) not null
);

create table drug_reference
(
  drug_id int not null constraint drug_reference_drug_fk references drug,
  reference_id int not null constraint drug_reference_reference_fk references reference,
  priority int,
  constraint drug_reference_pk primary key (drug_id, reference_id)
);

create index drug_reference_referenceid_ix on drug_reference (reference_id);

create table authority
(
  id int not null constraint authority_pk primary key,
  name varchar(200) not null constraint authority_name_un unique,
  description varchar(2000),
  weight int default 0
);

create table advisory_type
(
  id int not null constraint advisory_type_pk primary key,
  name varchar(50) not null constraint advisory_type_name_un unique,
  authority_id int not null constraint advisory_type_authority_fk references authority
);

create table advisory
(
  id int not null constraint advisory_pk primary key,
  drug_id int not null constraint advisory_drug_fk references drug,
  advisory_type_id int not null constraint advisory_advisory_type_fk references advisory_type,
  text varchar(2000) not null
);

create index advisory_advtype_ix on advisory (advisory_type_id);
create index advisory_drug_ix on advisory (drug_id);
```

Continuing as Postgres user `drugs` in the database of the same name, populate the tables with test data:
```sql
# ( psql -U drugs )

insert into analyst values(1, 'jdoe');
insert into analyst values(2, 'sch');

insert into authority(id, name, description, weight) values(1, 'FDA', 'Food and Drug Administration', 100);
insert into authority(id, name, description, weight) values(2, 'Anonymous', 'Various People with Opinions', 0);

insert into advisory_type(id, name, authority_id) values(1, 'Boxed Warning', 1);
insert into advisory_type(id, name, authority_id) values(2, 'Caution', 1);
insert into advisory_type(id, name, authority_id) values(3, 'Rumor', 2);

insert into compound(id, display_name, cas, entered_by, approved_by)
  select n, 'Test Compound ' || n , '5'||n||n||n||n||'-'||n||n, mod(n,2)+1, mod(n+1,2) + 1
  from generate_series(1,5) n
;

insert into drug(id, name, compound_id, category_code, descr, mesh_id, cid, registered_by)
  select
    n,
    'Test Drug ' || n,
    n,
    case when mod(n, 2) = 0 then 'A' else 'B' end category_code,
    'This is drug number ' || n || '.',
    'MESH' || n,
    n * 99,
    mod(n+1,2) + 1
  from generate_series(1,5) n
;

insert into reference(id, publication)
 select 100 * n + 1, 'Publication 1 about drug # ' || n
 from generate_series(1,5) n
;
insert into reference(id, publication)
 select 100*n+ 2, 'Publication 2 about drug # ' || n
 from generate_series(1,5) n
;
insert into reference(id, publication)
 select 100*n + 3, 'Publication 3 about drug # ' || n
 from generate_series(1,5) n
;

insert into drug_reference (drug_id, reference_id, priority) select n, 100*n + 1, n
 from generate_series(1,5) n
;
insert into drug_reference (drug_id, reference_id, priority)
 select n, 100*n + 2, n
 from generate_series(1,5) n
;
insert into drug_reference (drug_id, reference_id, priority)
 select n, 100*n + 3, n
 from generate_series(1,5) n
;

insert into advisory(id, drug_id, advisory_type_id, text)
 select 100*n+1, n, 1, 'Advisory concerning drug ' || n
 from generate_series(1,5) n
;
insert into advisory(id, drug_id, advisory_type_id, text)
 select 100*n+2, n, 2, 'Caution concerning drug ' || n
 from generate_series(1,5) n
;
insert into advisory(id, drug_id, advisory_type_id, text)
 select 123*n, n, 3, 'Heard this might be bad -anon' || n
 from generate_series(1,5) n
;
```

To complete the database setup, create properties file `jdbc.props` to hold our connection information:
```shell
cat > db/jdbc.props << EOF
jdbc.driverClassName=org.postgresql.Driver
jdbc.url=jdbc:postgresql://localhost:5432/drugs
jdbc.username=drugs
jdbc.password=drugs
EOF
```

## Generate Database Metadata

Now that the database is created and SQL/JSON-Query installed, we can generate our database metadata
via the following Maven command:

```shell
mvn -f query-gen/dbmd/pom.xml compile exec:java -DjdbcProps=jdbc.props -Ddb=pg
```

As noted above, it's also easy to generate the database metadata without relying on Maven or Java, if you
will just execute the
[database metadata query](https://github.com/scharris/sqljson-query-dropin/tree/main/dbmd/src/main/resources)
for your database type (Oracle or Postgres) and save the resulting json value to file
`query-gen/dbmd/dbmd.json`. The query has one parameter `relPat` which is a regular expression for table
names to be included, for which you can pass '.*' or adjust it as required.

The metadata is generated at `query-gen/dbmd/dbmd.json`, which is where it's expected to be for the
query generator. It's good to glance at its contents when you're getting started just to make sure
that the tool found the tables and views you expected it to.

## Query Generation

We're now ready to write our query specifications and to generate the SQL and result types sources from them.

## Single-Table Query
We're expected to define our queries in file `query-gen/queries/query-specs.ts`. Create the file in a text editor
with the following initial contents:

```typescript
import {QueryGroupSpec, QuerySpec, RecordCondition} from 'sqljson-query';

const drugsQuery1: QuerySpec = {
  queryName: 'drugs query 1',
  tableJson: {
     table: 'drug',
     recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
     fieldExpressions: [
        { field: 'name', jsonProperty: 'drugName' },
        'category_code', // short for: { field: 'category_code', jsonProperty: 'categoryCode' }
        { expression: '$$.cid + 1000',
          jsonProperty: 'cidPlus1000',
          fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'} },
     ],
  }
};

export const queryGroupSpec: QueryGroupSpec = {
   defaultSchema: 'public',
   generateUnqualifiedNamesForSchemas: [ 'public' ],
   propertyNameDefault: 'CAMELCASE',
   querySpecs: [
      drugsQuery1,
   ]
};
``` 

Here the first definition, `drugsQuery1` is our first query and is of type `QuerySpec`. The lower definition
represents the total set of queries and is the only export for the module. It contains the list of queries to
generate in `querySpecs`, which is just `drugsQuery1` at present. It also specifies some options that apply
to all queries such as the default schema name to be assumed for unqualified tables.

In `drugsQuery1` we've defined a simple query based on just a single table. It's given a name via `queryName` which
is used to determine the names of the generated SQL files and TypeScript/Java source files. The rest of the query
specification lies in the `tableJson` property, which describes how to form JSON output for a given "top" table and
related tables.

Let's briefly go over the properties of the `tableJson` object, since it's the centerpiece of our query.
```typescript
tableJson: {
  table: 'drug',
  recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
  fieldExpressions: [
    { field: 'name', jsonProperty: 'drugName' },
    'category_code', // short for: { field: 'category_code', jsonProperty: 'categoryCode' }
    { expression: '$$.cid + 1000',
      jsonProperty: 'cidPlus1000',
      fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'} },
  ],
}
```

- The `table` property specifies the top (and here the only) table in this JSON output, which is table "drug".


- The `recordCondition` is present to filter the rows of our "drug" table, which can be an arbitrary SQL predicate,
basically anything suitable for a WHERE clause. Here we're restricting results by `category_code` value, and using
a SQL parameter named `catCode` as part of the predicate expression. You can use whatever notation is needed
by your SQL execution runtime to indicate parameters.  The `paramNames` property is not required, but if it is
provided then a constant will be defined in the TypeScript or Java source code for each parameter entered here
with value equal to the parameter name, to help catch errors involving using wrong parameter names.


- Finally, the `fieldExpressions` property lists the fields and expressions involving the fields from `table` which
to be included as properties in the JSON objects representing the table rows. The field expressions take three
forms here, which cover all possibilities:

  - The first item shows the general form for a simple table field:
    ```{ field: 'name', jsonProperty: 'drugName' }```. In this case the source database table field and desired
    JSON property name are both given explicitly.
  - The second form ('category_code') is simply a string which is the database field name, in which case the JSON
  property name is automatically set to the camelcase form of the given name ('categoryCode'), because of our choice
  of "propertyNameDefault: 'CAMELCASE'" in the query group specification. Another option is 'AS_IN_DB', leaving
  property names defaulting to the database field name without modification.
  - The third and final entry is a general expression involving database fields:
    ```
    { expression: '$$.cid + 1000',
      jsonProperty: 'cidPlus1000',
      fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'} }
    ```
  In this case `expression` is provided instead of `field` (these two are mutually exclusive), and the `jsonProperty`
  and `fieldTypeInGeneratedSource` properties are *required* for expressions, to tell the tool how to name the
  expression and what type its values should be given in result types. Notice that the result types are given by
  source language. With this form you should be able to include any kind of expression that could be included in a
  SQL `SELECT` clause. The syntax `$$` shown in the example expression can be used to qualify the table's fields,
  though it is usually not necessary. Any occurrences of `$$` will be replaced with the alias generated for the
  current table by the query generator.

So that describes our first query on the `drug` table. Now let's generate the SQL and TypeScript sources for it.

But first we need to make source directories to hold our generated sources:
```
mkdir -p src/sql src/ts
```
Then we can generate the SQL and TypeScript sources for our query as follows:
```shell
npm run --prefix query-gen generate-queries -- --sqlDir=../src/sql --tsQueriesDir=../src/ts --tsRelMdsDir=../src/ts
```
If you open the generated SQL file at `src/sql/drugs-query-1.sql`, you should see something
like the following:
```sql
select
  -- row object for table 'drug'
  jsonb_build_object(
    'drugName', q."drugName",
    'categoryCode', q."categoryCode",
    'cidPlus1000', q."cidPlus1000"
  ) json
from (
  -- base query for table 'drug'
  select
    d.name "drugName",
    d.category_code "categoryCode",
    d.cid + 1000 "cidPlus1000"
  from
    drug d
  where (
    (category_code = :catCode)
  )
) q
```  

If we try executing the query in psql, supplying the value 'A' for parameter `catCode`, we should 
see output like the following:
```json lines
{"drugName": "Test Drug 2", "cidPlus1000": 1198, "categoryCode": "A"}
{"drugName": "Test Drug 4", "cidPlus1000": 1396, "categoryCode": "A"}
```

Also a TypeScript module was generated, at `src/ts/drugs-query-1.ts`. It looks like:
```typescript
// The types defined in this file correspond to results of the following generated SQL queries.
export const sqlResource = "drugs-query-1.sql";

// query parameters
export const catCodeParam = 'catCode';

// Below are types representing the result data for the generated query, with top-level type first.
export interface Drug
{
  drugName: string;
  categoryCode: string;
  cidPlus1000: number | null;
}
```
This TypeScript module defines an interface `Drug` which matches the form of the result objects in the
query results. It also defines a constant for the parameter name as a convenience/safety feature, and
lets you know the corresponding SQL file that was generated as well.

## Query with Parent Table

The single-table query above lacks information about the primary compound found in each drug,
so let's make a new query adding this information from the `compound` table. The `compound` table
is a parent table of our top table `drug`.

<img src="img/drug-compound.svg" alt="drug compound relationship" width="350" height="170">

TODO: ER diagram here.


TODO

Add reference property for parent table compound.

```typescript
// Add compound parent table.
const drugsQuery2: QuerySpec = {
   queryName: 'drugs query 2',
   tableJson: {
      table: 'drug',
      recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
      fieldExpressions: [
         { field: 'name', jsonProperty: 'drugName' },
         'category_code',
      ],
      // (Added) >>>
      parentTables: [
         {
            referenceName: 'primaryCompound',
            table: 'compound',
            fieldExpressions: [
               { field: 'id', jsonProperty: 'compoundId' },
               { field: 'display_name', jsonProperty: 'compoundDisplayName' },
            ],
         }
      ],
     // <<< (Added)
   }
};
```

Add additional information about the compound via compound's own parent tables.

```typescript
// Add employee entered-by/approved-by information from parent 'analyst' tables of compound.
const drugsQuery3: QuerySpec = {
   queryName: 'drugs query 3',
   tableJson: {
      table: 'drug',
      recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
      fieldExpressions: [
         { field: 'name', jsonProperty: 'drugName' },
         'category_code', // short for { field: 'category_code', jsonProperty: 'categoryCode' }
      ],
      parentTables: [
         {
            referenceName: 'primaryCompound',
            table: 'compound',
            fieldExpressions: [
               { field: 'id', jsonProperty: 'compoundId' },
               { field: 'display_name', jsonProperty: 'compoundDisplayName' },
            ],
            // + Add entered by and approved by fields "inline" via two different joins to analyst table
            parentTables: [
               {
                  table: 'analyst',
                  fieldExpressions: [
                     { field: 'short_name', jsonProperty: 'enteredByAnalyst' }
                  ],
                  viaForeignKeyFields: ['entered_by'] // <- select on of two foreign keys to analyst
               },
               {
                  table: 'analyst',
                  fieldExpressions: [
                     { field: 'short_name', jsonProperty: 'approvedByAnalyst' }
                  ],
                  viaForeignKeyFields: ['approved_by'] // <- select one of two foreign keys to analyst
               }
            ]
         }
      ],
   }
};
```

Add advisories collection from child table "advisory".
```typescript
// Add advisories child collection.
const drugsQuery4: QuerySpec = {
   queryName: 'drugs query 4',
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
               {
                  table: 'analyst',
                  fieldExpressions: [
                     { field: 'short_name', jsonProperty: 'approvedByAnalyst' }
                  ],
                  viaForeignKeyFields: ['approved_by'] // <- select one of two foreign keys to analyst
               }
            ]
         }
      ],
      // + Add advisories child collection.
      childTables: [
         {
            collectionName: 'advisories',
            table: 'advisory',
            fieldExpressions: [
               'advisory_type_id',
               { field: 'text', jsonProperty: 'advisoryText' },
            ]
         }
      ]
   }
};
```

// Add information to each advisory via advisory's parent and grandparent.
```typescript
// + Add advisory type and authority information via advisory parent and grandparent.
const drugsQuery5: QuerySpec = {
   queryName: 'drugs query 5',
   tableJson: {
      table: 'drug',
      recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
      fieldExpressions: [
         { field: 'name', jsonProperty: 'drugName' },
         'category_code', // short for { field: 'category_code', jsonProperty: 'categoryCode' }
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
               {
                  table: 'analyst',
                  fieldExpressions: [
                     { field: 'short_name', jsonProperty: 'approvedByAnalyst' }
                  ],
                  viaForeignKeyFields: ['approved_by'] // <- select one of two foreign keys to analyst
               }
            ]
         }
      ],
      childTables: [
         {
            collectionName: 'advisories',
            table: 'advisory',
            fieldExpressions: [
               'advisory_type_id',
               { field: 'text', jsonProperty: 'advisoryText' },
            ],
            // + Add advisory type and authority information via advisory parent and grandparent.
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
         }
      ]
   }
};
```

```typescript
// Add references from far side of a many-many relationship.
const drugsQuery6: QuerySpec = {
   queryName: 'drugs query 6',
   tableJson: {
      table: 'drug',
      recordCondition: { sql: 'category_code = :catCode', paramNames: ['catCode'] },
      fieldExpressions: [
         { field: 'name', jsonProperty: 'drugName' },
         'category_code', // short for { field: 'category_code', jsonProperty: 'categoryCode' }
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
               {
                  table: 'analyst',
                  fieldExpressions: [
                     { field: 'short_name', jsonProperty: 'approvedByAnalyst' }
                  ],
                  viaForeignKeyFields: ['approved_by'] // <- select one of two foreign keys to analyst
               }
            ]
         }
      ],
      childTables: [
         {
            collectionName: 'advisories',
            table: 'advisory',
            fieldExpressions: [
               'advisory_type_id',
               { field: 'text', jsonProperty: 'advisoryText' },
            ],
            // + Add advisory type and authority information via advisory parent and grandparent.
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
         // + Add items from far side of a many-many relationship.
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
