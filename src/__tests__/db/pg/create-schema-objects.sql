create table analyst (
    id integer not null constraint analyst_pk primary key,
    short_name varchar(50) not null
);

create table compound
(
    id                 integer not null
        constraint compound_pk
            primary key,
    display_name       varchar(50),
    nctr_isis_id       varchar(100),
    smiles             varchar(2000),
    canonical_smiles   varchar(2000),
    cas                varchar(50),
    mol_formula        varchar(2000),
    mol_weight         numeric,
    entered            timestamp with time zone,
    entered_by         integer not null
        constraint compound_enteredby_analyst_fk
            references analyst,
    approved_by         integer
        constraint compound_approvedby_analyst_fk
            references analyst
);

create table drug
(
    id                      integer      not null
        constraint drug_pk
            primary key,
    name                    varchar(500) not null
        constraint drug_name_un
            unique,
    compound_id             integer      not null
        constraint drug_compound_fk
            references compound,
    mesh_id                 varchar(7)
        constraint drug_meshid_un
            unique,
    drugbank_id             varchar(7)
        constraint drug_drugbankid_un
            unique,
    cid                     integer,
    category_code varchar(1) not null,
    descr varchar(500),
    therapeutic_indications varchar(4000),
    registered            timestamp with time zone,
    registered_by         integer not null
        constraint drug_analyst_fk
            references analyst,
    market_entry_date  date
);

create index drug_compoundid_ix
    on drug (compound_id);

create index compound_canonsmiles_ix
    on compound (canonical_smiles);

create table reference
(
    id          integer       not null
        constraint reference_pk
            primary key,
    publication varchar(2000) not null
);

create table drug_reference
(
    drug_id      integer not null
        constraint drug_reference_drug_fk
            references drug
            on delete cascade,
    reference_id integer not null
        constraint drug_reference_reference_fk
            references reference
            on delete cascade,
    priority     integer,
    constraint drug_reference_pk
        primary key (drug_id, reference_id)
);

create index drug_reference_referenceid_ix
    on drug_reference (reference_id);

create table authority
(
    id          integer      not null
        constraint authority_pk
            primary key,
    name        varchar(200) not null
        constraint authority_name_un
            unique,
    url         varchar(500),
    description varchar(2000),
    weight integer default 0
);

create table advisory_type
(
    id           integer     not null
        constraint advisory_type_pk
            primary key,
    name         varchar(50) not null
        constraint advisory_type_name_un
            unique,
    authority_id integer     not null
        constraint advisory_type_authority_fk
            references authority
);

create table advisory
(
    id               integer       not null
        constraint advisory_pk
            primary key,
    drug_id          integer       not null
        constraint advisory_drug_fk
            references drug
            on delete cascade,
    advisory_type_id integer       not null
        constraint advisory_advisory_type_fk
            references advisory_type,
    text             varchar(2000) not null
);

create index advisory_advtype_ix
    on advisory (advisory_type_id);

create index advisory_drug_ix
    on advisory (drug_id);

create table functional_category
(
    id                            integer      not null
        constraint category_pk
            primary key,
    name                          varchar(500) not null
        constraint functional_category_name_un
            unique,
    description                   varchar(2000),
    parent_functional_category_id integer
        constraint funcat_funcat_fk
            references functional_category
);

create table drug_functional_category
(
    drug_id                integer not null
        constraint drug_category_drug_fk
            references drug
            on delete cascade,
    functional_category_id integer not null
        constraint drug_funcat_funcat_fk
            references functional_category,
    authority_id           integer not null
        constraint drugfuncat_authority_fk
            references authority,
    seq                    integer,
    constraint drugfuncat_pk
        primary key (drug_id, functional_category_id, authority_id)
);

create index drugfuncat_funcat_ix
    on drug_functional_category (functional_category_id);

create index drugfuncat_authority_ix
    on drug_functional_category (authority_id);

create index funcat_parentfuncat_ix
    on functional_category (parent_functional_category_id);

create table manufacturer
(
    id   integer      not null
        constraint manufacturer_pk
            primary key,
    name varchar(200) not null
        constraint manufacturer_name_un
            unique
);

create table brand
(
    drug_id         integer      not null
        constraint brand_drug_fk
            references drug
            on delete cascade,
    brand_name      varchar(200) not null,
    language_code   varchar(10),
    manufacturer_id integer
        constraint brand_manufacturer_fk
            references manufacturer,
    constraint brand_pk
        primary key (drug_id, brand_name)
);

create index brand_mfr_ix
    on brand (manufacturer_id);

