with
fieldMetadatas as (
  select
    tc.owner,
    tc.table_name,
    json_arrayagg(
      json_object(
        'name' value tc.column_name,
        'databaseType' value tc.data_type,
        'nullable' value case tc.nullable when 'Y' then 'true' else 'false' end format json,
        'primaryKeyPartNumber' value
          (
            select col.position
            from all_cons_columns col
            join all_constraints con on con.constraint_name = col.constraint_name
            where
              con.constraint_type = 'P' and
              con.owner = tc.owner and con.table_name = tc.table_name and
              col.column_name = tc.column_name
          ),
        'length' value tc.data_length,
        'precision' value tc.data_precision,
        'precisionRadix' value case when tc.data_precision is not null then 10 end,
        'fractionalDigits' value tc.data_scale
        returning clob
      )
      returning clob
    ) fmds
  from all_tab_columns tc
  where regexp_like(tc.owner||'.'||tc.table_name, :relIncludePat) and not regexp_like(tc.owner||'.'||tc.table_name, :relExcludePat)
  group by tc.owner, tc.table_name
),
tableMetadatas as (
  select
    treat(coalesce(json_arrayagg(
      json_object(
        'relationId' value json_object('schema' value r.owner, 'name' value r.name),
        'relationType' value r.type,
        'fields' value (select fmds from fieldMetadatas where  owner = r.owner and table_name = r.name)
        returning clob
      )
      returning clob
    ), to_clob('[]')) as json) tableMds
  from (
    select t.owner, t.table_name name, 'Table' type
    from all_tables t
    where regexp_like(t.owner||'.'||t.table_name, :relIncludePat) and not regexp_like(t.owner||'.'||t.table_name, :relExcludePat)
    union all
    select v.owner, v.view_name, 'View' type
    from all_views v
    where regexp_like(v.owner||'.'||v.view_name, :relIncludePat) and not regexp_like(v.owner||'.'||v.view_name, :relExcludePat)
  ) r
),
foreignKeys as (
-- foreign keys
  select treat(coalesce(json_arrayagg(fk.obj returning clob), to_clob('[]')) as json) fks
  from (
    select
      json_object(
        'constraintName' value fkcon.constraint_name,
        'foreignKeyRelationId' value json_object('schema' value fkcon.owner, 'name' value fkcon.table_name),
        'primaryKeyRelationId' value json_object('schema' value pkcon.owner, 'name' value pkcon.table_name),
        'foreignKeyComponents' value
          json_arrayagg(
            json_object(
              'foreignKeyFieldName' value fkcol.column_name,
              'primaryKeyFieldName' value pkcol.column_name
            )
            order by fkcol.position returning clob
          )
        returning clob
      ) obj
    from all_constraints fkcon
    join all_constraints pkcon
      on fkcon.r_constraint_name = pkcon.constraint_name and fkcon.r_owner = pkcon.owner
    join all_cons_columns fkcol
      on fkcol.constraint_name = fkcon.constraint_name and fkcol.owner = fkcon.owner
    join all_cons_columns pkcol
      on pkcol.constraint_name = fkcon.r_constraint_name and pkcol.owner = fkcon.r_owner
      and pkcol.position = fkcol.position
   where
      fkcon.constraint_type = 'R' and
      regexp_like(fkcon.owner||'.'||fkcon.table_name, :relIncludePat) and (not regexp_like(fkcon.owner||'.'||fkcon.table_name, :relExcludePat)) and
      regexp_like(pkcon.owner||'.'||pkcon.table_name, :relIncludePat) and (not regexp_like(pkcon.owner||'.'||pkcon.table_name, :relExcludePat))
    group by fkcon.constraint_name, fkcon.owner, fkcon.table_name, pkcon.owner, pkcon.table_name
  ) fk
)
-- main query
select
  json_serialize(
    json_object(
      'dbmsName' value 'Oracle',
      'dbmsVersion' value (select version_full from product_component_version where product like 'Oracle Database %'),
      'caseSensitivity' value 'INSENSITIVE_STORED_UPPER',
      'relationMetadatas' value (select tableMds from tableMetadatas),
      'foreignKeys' value (select fks from foreignKeys)
      returning clob
    ) returning clob pretty
  ) json
from dual