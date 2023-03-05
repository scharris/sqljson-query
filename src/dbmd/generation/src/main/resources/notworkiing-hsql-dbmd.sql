with
relationMetadatasQuery as (
  select
    coalesce(json_arrayagg(json_object(
      'relationId' value json_object('schema' value r.schemaname, 'name' value r.name),
      'relationType' value r.type,
      'fields' value (
        select
          coalesce(json_arrayagg(json_object(
            'name' value col.column_name,
            'databaseType' value case col.data_type
              when 'CHARACTER VARYING' then 'VARCHAR'
              when 'BINARY LARGE OBJECT' then 'BLOB'
              else col.data_type end,
            'nullable' value case col.is_nullable when 'NO' then false when 'YES' then true end,
        /* TODO: Strangely, including this section causes some 'r' fields not to be found above.
            'primaryKeyPartNumber' value (
              select kcu.ordinal_position
              from information_schema.key_column_usage kcu
              where
                kcu.table_schema = col.table_schema and
                kcu.table_name = col.table_name and
                kcu.column_name = col.column_name and
                kcu.constraint_name = (
                  select constraint_name
                  from information_schema.table_constraints tc
                  where tc.constraint_type = 'PRIMARY KEY' and
                    tc.table_schema = r.schemaname and
                    tc.table_name = r.name
                )
            ),
         */
            'length' value col.character_maximum_length,
            'precision' value col.numeric_precision,
            'precisionRadix' value col.numeric_precision_radix,
            'fractionalDigits' value col.numeric_scale
          ) order by col.ordinal_position), '[]')
        from information_schema.columns col
        where col.table_schema = r.schemaname and col.table_name = r.name
      ) format json -- fields property
    )), '[]') json
  from (
    select
      t.table_schema schemaname,
      t.table_name name,
      case t.table_type when 'BASE TABLE' then 'table' when 'VIEW' then 'view' else t.table_type end type
    from information_schema.tables t
  ) r
  where r.schemaname <> 'INFORMATION_SCHEMA'
    and regexp_like(r.schemaname || '.' || r.name, :relIncludePat)
    and not regexp_like(r.schemaname || '.' || r.name,  :relExcludePat)
),
foreignKeysQuery as (
  select coalesce(json_arrayagg(
    json_object(
      'constraintName' value fk.constr_name, -- TODO: fk.constr_name not found, though it should be (?)
      'foreignKeyRelationId' value
        json_object(
          'schema' value fk.child_schema,
          'name' value fk.child_table
        ),
      'primaryKeyRelationId' value
        json_object(
          'schema' value fk.parent_schema,
          'name' value fk.parent_table
        ),
      'foreignKeyComponents' value
        json_arrayagg(
          json_object(
            'foreignKeyFieldName' value fk.fk_field_name,
            'primaryKeyFieldName' value fk.pk_field_name
          )
          order by fk.ordinal_position
        )
    )
  ), '[]') json
  from (
    select
      child_tc.constraint_name constr_name,
      child_tc.table_schema child_schema,
      child_tc.table_name child_table,
      parent_tc.table_schema parent_schema,
      parent_tc.table_name parent_table,
      child_fk_comp.column_name fk_field_name,
      parent_pk_comp.column_name pk_field_name,
      child_fk_comp.ordinal_position ordinal_position
    from information_schema.table_constraints child_tc
    -- To-one join for parent's pk constraint schema and name.
    join information_schema.referential_constraints child_rc
      on  child_tc.constraint_schema = child_rc.constraint_schema
      and child_tc.constraint_name = child_rc.constraint_name
    -- To-one join for parent's pk constraint information.
    join information_schema.table_constraints parent_tc
      on  child_rc.unique_constraint_schema = parent_tc.constraint_schema
      and child_rc.unique_constraint_name = parent_tc.constraint_name
    -- To-many join for the field components of the foreign key in the child table.
    join information_schema.key_column_usage child_fk_comp
      on  child_tc.constraint_schema = child_fk_comp.constraint_schema
      and child_tc.constraint_name = child_fk_comp.constraint_name
    -- To-one join for the parent table fk field component which is matched to that of the child.
    join information_schema.key_column_usage parent_pk_comp
      on  child_rc.unique_constraint_schema = parent_pk_comp.constraint_schema
      and child_rc.unique_constraint_name = parent_pk_comp.constraint_name
      and child_fk_comp.position_in_unique_constraint = parent_pk_comp.ordinal_position
    where child_tc.constraint_type = 'FOREIGN KEY'
      and child_fk_comp.table_schema <> 'INFORMATION_SCHEMA'
      and regexp_like(child_tc.table_schema || '.' || child_tc.table_name, :relIncludePat)
      and not regexp_like(child_tc.table_schema || '.' || child_tc.table_name, :relExcludePat)
      and regexp_like(parent_tc.table_schema || '.' || parent_tc.table_name, :relIncludePat)
      and not regexp_like(parent_tc.table_schema || '.' || parent_tc.table_name, :relExcludePat)
  ) fk
  group by
    fk.child_schema,
    fk.child_table,
    fk.parent_schema,
    fk.parent_table,
    fk.constr_name
)
-- main query
select json_object(
  'dbmsName' value 'HSQLDB',
  'dbmsVersion' value (
      select character_value
      from information_schema.sql_implementation_info
      where implementation_info_name = 'DBMS VERSION'
  ),
  'caseSensitivity' value 'INSENSITIVE_STORED_UPPER',
  'relationMetadatas' value (select json from relationMetadatasQuery) format json,
  'foreignKeys' value (select json from foreignKeysQuery) format json
) json
from (values(1))