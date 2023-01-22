with
ignoreSchemasQuery as (
  select 'INFORMATION_SCHEMA' schema_name
),
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
            'length' value col.character_maximum_length,
            'precision' value col.numeric_precision,
            'precisionRadix' value col.numeric_precision_radix,
            'fractionalDigits' value col.numeric_scale
          ) order by col.ordinal_position), '[]' format json)
        from information_schema.columns col
        where col.table_schema = r.schemaname and col.table_name = r.name
      ) -- fields property
    )), '[]' format json) json
  from (
    select
      t.table_schema schemaname,
      t.table_name name,
      case t.table_type when 'BASE TABLE' then 'table' when 'VIEW' then 'view' else t.table_type end type
    from information_schema.tables t
  ) r
  where r.schemaname not in (select * from ignoreSchemasQuery)
    and regexp_like(r.schemaname || '.' || r.name, :relIncludePat)
    and not regexp_like(r.schemaname || '.' || r.name,  :relExcludePat)
),
foreignKeysQuery as (
  select coalesce(json_arrayagg(fk.obj), '[]' format json) json
  from (
    select
      json_object(
        'constraintName' value child_tc.constraint_name,
        'foreignKeyRelationId' value
          json_object(
            'schema' value child_tc.table_schema,
            'name' value child_tc.table_name
          ),
        'primaryKeyRelationId' value
          json_object(
            'schema' value parent_tc.table_schema,
            'name' value parent_tc.table_name
          ),
        'foreignKeyComponents' value
          json_arrayagg(
            json_object(
              'foreignKeyFieldName' value child_fk_comp.column_name,
              'primaryKeyFieldName' value parent_pk_comp.column_name
            )
            order by child_fk_comp.ordinal_position
          )
      ) obj
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
      and child_fk_comp.table_schema not in (select * from ignoreSchemasQuery)
      and regexp_like(child_tc.table_schema || '.' || child_tc.table_name, :relIncludePat)
      and not regexp_like(child_tc.table_schema || '.' || child_tc.table_name, :relExcludePat)
      and regexp_like(parent_tc.table_schema || '.' || parent_tc.table_name, :relIncludePat)
      and not regexp_like(parent_tc.table_schema || '.' || parent_tc.table_name, :relExcludePat)
    group by
      child_tc.table_schema,
      child_tc.table_name,
      parent_tc.table_name,
      parent_tc.table_schema,
      child_tc.constraint_name
  ) fk
)
-- main query
select json_object(
  'dbmsName' value 'H2',
  'dbmsVersion' value
    (select setting_value from information_schema.settings where setting_name = 'info.VERSION'),
  'caseSensitivity' value 'INSENSITIVE_STORED_UPPER',
  'relationMetadatas' value (select json from relationMetadatasQuery),
  'foreignKeys' value (select json from foreignKeysQuery)
) json