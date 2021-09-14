create table analyst (
    id integer not null,
    short_name varchar(50) not null,
    constraint analyst_pk primary key(id)
);

create table compound
(
    id integer not null,
    display_name varchar(50),
    nctr_isis_id varchar(100),
    smiles varchar(2000),
    canonical_smiles varchar(2000),
    cas varchar(50),
    mol_formula varchar(2000),
    mol_weight numeric,
    entered timestamp,
    entered_by integer not null,
    approved_by integer,
    constraint compound_pk primary key(id),
    constraint compound_enteredby_analyst_fk foreign key(entered_by) references analyst(id),
    constraint compound_approvedby_analyst_fk foreign key(approved_by) references analyst(id)
);

create table drug
(
    id integer not null,
    name varchar(500) not null,
    compound_id integer not null,
    mesh_id varchar(7),
    drugbank_id varchar(7),
    cid integer,
    category_code varchar(1) not null,
    descr varchar(500),
    therapeutic_indications varchar(4000),
    registered timestamp,
    registered_by integer not null,
    market_entry_date date,
    constraint drug_pk primary key(id),
    constraint drug_name_un unique(name),
    constraint drug_meshid_un unique(mesh_id),
    constraint drug_drugbankid_un unique(drugbank_id),
    constraint drug_compound_fk foreign key(compound_id) references compound(id),
    constraint drug_analyst_fk foreign key(registered_by) references analyst(id)
);

create index drug_compoundid_ix on drug (compound_id);

create table reference
(
    id integer not null,
    publication varchar(2000) not null,
    constraint reference_pk primary key(id)
);

create table drug_reference
(
    drug_id integer not null,
    reference_id integer not null,
    priority integer,
    constraint drug_reference_pk primary key (drug_id, reference_id),
    constraint drug_reference_drug_fk foreign key(drug_id) references drug(id) on delete cascade,
    constraint drug_reference_reference_fk foreign key(reference_id) references reference(id) on delete cascade
);

create index drug_reference_referenceid_ix on drug_reference (reference_id);

create table authority
(
    id integer not null,
    name varchar(200) not null,
    url varchar(500),
    description varchar(2000),
    weight integer default 0,
    constraint authority_pk primary key(id),
    constraint authority_name_un unique(name)
);

create table advisory_type
(
    id integer not null,
    name varchar(50) not null,
    authority_id integer not null,
    constraint advisory_type_pk primary key(id),
    constraint advisory_type_name_un unique(name),
    constraint advisory_type_authority_fk foreign key(authority_id) references authority(id)
);

create table advisory
(
    id integer not null,
    drug_id integer not null,
    advisory_type_id integer not null,
    text varchar(2000) not null,
    constraint advisory_pk primary key(id),
    constraint advisory_drug_fk foreign key(drug_id) references drug(id) on delete cascade,
    constraint advisory_advisory_type_fk foreign key(advisory_type_id) references advisory_type(id)
);

create index advisory_advtype_ix on advisory (advisory_type_id);

create index advisory_drug_ix on advisory (drug_id);

create table functional_category
(
    id integer not null,
    name varchar(500) not null,
    description varchar(2000),
    parent_functional_category_id integer,
    constraint category_pk primary key(id),
    constraint functional_category_name_un unique(name),
    constraint funcat_funcat_fk foreign key(parent_functional_category_id) references functional_category(id)
);

create table drug_functional_category
(
    drug_id integer not null,
    functional_category_id integer not null,
    authority_id integer not null,
    seq integer,
    constraint drugfuncat_pk primary key (drug_id, functional_category_id, authority_id),
    constraint drug_category_drug_fk foreign key(drug_id) references drug(id) on delete cascade,
    constraint drug_funcat_funcat_fk foreign key(functional_category_id) references functional_category(id),
    constraint drugfuncat_authority_fk foreign key(authority_id) references authority(id)
);

create index drugfuncat_funcat_ix on drug_functional_category (functional_category_id);

create index drugfuncat_authority_ix on drug_functional_category (authority_id);

create index funcat_parentfuncat_ix on functional_category (parent_functional_category_id);

create table manufacturer
(
    id integer not null,
    name varchar(200) not null,
    constraint manufacturer_pk primary key(id),
    constraint manufacturer_name_un unique(name)
);

create table brand
(
    drug_id integer not null,
    brand_name varchar(200) not null,
    language_code varchar(10),
    manufacturer_id integer,
    constraint brand_pk primary key (drug_id, brand_name),
    constraint brand_drug_fk foreign key(drug_id) references drug(id) on delete cascade,
    constraint brand_manufacturer_fk foreign key(manufacturer_id) references manufacturer(id)
);

create index brand_mfr_ix on brand (manufacturer_id);
