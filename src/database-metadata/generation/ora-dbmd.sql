with
fieldMetadatas as (
  select
    tc.table_name,
    json_arrayagg(
      json_object(
        'name' value tc.column_name,
        'databaseType' value tc.data_type,
        'nullable' value case tc.nullable when 'Y' then 'true' else 'false' end format json,
        'primaryKeyPartNumber' value
          (
            select col.position
            from user_cons_columns col
            join user_constraints con on con.constraint_name = col.constraint_name
            where con.constraint_type = 'P' and con.table_name = tc.table_name and col.column_name = tc.column_name
          ),
        'length' value tc.data_length,
        'precision' value tc.data_precision,
        'precisionRadix' value case when tc.data_precision is not null then 10 end,
        'fractionalDigits' value tc.data_scale
        returning clob
      )
      returning clob
    ) fmds
  from user_tab_columns tc
  group by tc.table_name
),
tableMetadatas as (
    select
      treat(coalesce(json_arrayagg(
        json_object(
          'relationId' value json_object('schema' value user, 'name' value t.table_name),
          'relationType' value 'Table',
          'fields' value (select fmds from fieldMetadatas where table_name = t.table_name)
          returning clob
        )
        returning clob
      ), to_clob('[]')) as json) tableMds
    from user_tables t
),
foreignKeys as (
-- foreign keys
  select treat(coalesce(json_arrayagg(fk.obj returning clob), to_clob('[]')) as json) fks
  from (
    select
      json_object(
        'constraintName' value fkcon.constraint_name,
        'foreignKeyRelationId' value json_object('schema' value user, 'name' value fkcon.table_name),
        'primaryKeyRelationId' value json_object('schema' value user, 'name' value pkcon.table_name),
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
    from user_constraints fkcon
    join user_constraints pkcon
      on fkcon.r_constraint_name = pkcon.constraint_name
    join user_cons_columns fkcol
      on fkcol.constraint_name = fkcon.constraint_name
    join user_cons_columns pkcol
      on pkcol.constraint_name = fkcon.r_constraint_name
      and pkcol.position = fkcol.position
    where fkcon.constraint_type = 'R'
    group by fkcon.constraint_name, fkcon.table_name, pkcon.table_name
  ) fk
)
-- main query
select
  json_object(
    'dbmsName' value 'Oracle',
    'dbmsVersion' value (select version_full from product_component_version where product like 'Oracle Database %'),
    'caseSensitivity' value 'INSENSITIVE_STORED_UPPER',
    'relationMetadatas' value (select tableMds from tableMetadatas),
    'foreignKeys' value (select fks from foreignKeys)
    returning clob
  ) dbmd
from dual
