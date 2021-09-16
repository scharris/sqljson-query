# PostgreSQL Tutorial Database Setup

Here we'll setup a small Postgres database for our tutorial. We'll assume a Postgres server is installed on the
local machine and listening on localhost port 5432. If you would rather use Docker to run the example database,
see the [Postgres/Docker tutorial database setup documentation](tutorial-database-setup-pg-docker.md). Or if
you'd rather setup a MySQL database instead for the tutorial, see the
[MySQL tutorial database setup documentation](tutorial-database-setup-mysql.md).

First create the Postgres database and user using your Postgres admin user login:
```
# ( "psql -U postgres template1" or similar admin login )
create user drugs with password 'drugs';
create database drugs owner drugs;
\q
```

Then logging in as the new Postgres user `drugs` to the database created above, create the database objects:
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

To complete the database setup, create properties file `db/jdbc.props` to hold our connection information:
```shell
# db/jdbc.props
jdbc.driverClassName=org.postgresql.Driver
jdbc.url=jdbc:postgresql://localhost:5432/drugs
jdbc.username=drugs
jdbc.password=drugs
```

That's it! You're now ready to continue with the tutorial.
