insert into analyst values(1, 'jdoe');

insert into authority(id, name, url, description, weight)
  values(1, 'FDA', 'http://www.fda.gov', 'Food and Drug Administration', 100);
insert into authority(id, name, url, description, weight)
  values(2, 'Anonymous', null, 'Various People with Opinions', 0);
insert into advisory_type(id, name, authority_id)
 values(1, 'Boxed Warning', 1);
insert into advisory_type(id, name, authority_id)
 values(2, 'Caution', 1);
insert into advisory_type(id, name, authority_id)
 values(3, 'Rumor', 2);
insert into functional_category(id, name, description, parent_functional_category_id)
  values(1, 'Category A', 'Top level category A', null);
insert into functional_category(id, name, description, parent_functional_category_id)
  values(2, 'Category A.1', 'sub category 1 of A', 1);
insert into functional_category(id, name, description, parent_functional_category_id)
  values(3, 'Category A.1.1', 'sub category 1 of A.1', 2);
insert into functional_category(id, name, description, parent_functional_category_id)
  values(4, 'Category B', 'Top level category B', null);
insert into functional_category(id, name, description, parent_functional_category_id)
  values(5, 'Category B.1', 'sub category 1 of B', 4);
insert into functional_category(id, name, description, parent_functional_category_id)
  values(6, 'Category B.1.1', 'sub category 1 of B.1', 5);
insert into manufacturer(id, name)
  values(1, 'Acme Drug Co');
insert into manufacturer(id, name)
  values(2, 'PharmaCorp');
insert into manufacturer(id, name)
  values(3, 'SellsAll Drug Co.');


insert into compound(id, display_name, nctr_isis_id, cas, entered_by, entered)
  select n,
    'Test Compound ' || n ,
    'ISIS-' || n ,
    '5'||n||n||n||n||'-'||n||n,
    1,
    current_timestamp
  from generate_series(1,5) n
;

insert into drug(id, name, compound_id, therapeutic_indications, mesh_id, cid, registered_by, registered, market_entry_date)
  select
    n,
    'Test Drug ' || n,
    n,
    'Indication ' || n,
    'MESH' || n,
    n * 99,
    1,
    current_timestamp,
    current_date - n * 100
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

insert into drug_reference (drug_id, reference_id, priority)
 select n, 100*n + 1, n
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

insert into drug_functional_category(drug_id, functional_category_id, authority_id, seq)
 select n, mod(n,3)+1, 1, 1
 from generate_series(1,5) n
;

insert into drug_functional_category(drug_id, functional_category_id, authority_id, seq)
 select n, mod(n,3)+4, 1, 2
 from generate_series(1,5) n
;

insert into brand(drug_id, brand_name, language_code, manufacturer_id)
 select n, 'Brand'||n||'(TM)', 'EN', mod(n,3)+1
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

