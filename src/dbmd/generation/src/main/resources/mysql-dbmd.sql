with
ignoreSchemasQuery as (
  select 'information_schema' schema_name
),
relationMetadatasQuery as (
  select
    cast(coalesce(json_arrayagg(json_object(
      'relationId', json_object('schema', t.table_schema, 'name', t.table_name),
      'relationType', 'Table',
      'fields', (
        select
          cast(coalesce(json_arrayagg(json_object(
            'name', col.column_name,
            'databaseType', col.data_type,
            'nullable', case col.is_nullable when 'NO' then cast(false as json) when 'YES' then cast(true as json) end,
            'primaryKeyPartNumber', (
              select kcu.ordinal_position
              from information_schema.key_column_usage kcu
              where
                kcu.table_schema = col.table_schema and
                kcu.table_name = col.table_name and
                kcu.column_name = col.column_name and
                kcu.constraint_name = 'PRIMARY'
            ),
            'length', col.character_maximum_length,
            'precision', col.numeric_precision,
            'precisionRadix', case when col.numeric_precision is not null then 10 end,
            'fractionalDigits', case when col.numeric_precision is not null then col.numeric_scale end
          )), json_type('[]')) as json)
        from information_schema.columns col
        where col.table_schema = t.table_schema and col.table_name = t.table_name
      ) -- fields property
    )), json_type('[]')) as json) json
  from information_schema.tables t
  where t.table_schema not in (select * from ignoreSchemasQuery)
    and concat(t.table_schema, '.', t.table_name) regexp :relIncludePat
    and not (concat(t.table_schema, '.', t.table_name) regexp :relExcludePat)
),
foreignKeysQuery as (
  -- foreign keys
  select cast(coalesce(json_arrayagg(fk.obj), json_type('[]')) as json) json
  from (
    select
      json_object(
        'constraintName', child_tc.constraint_name,
        'foreignKeyRelationId',
          json_object(
            'schema', child_tc.table_schema,
            'name', child_tc.table_name
          ),
        'primaryKeyRelationId',
          json_object(
            'schema', parent_tc.table_schema,
            'name', parent_tc.table_name
          ),
        'foreignKeyComponents',
          json_arrayagg(
            json_object(
              'foreignKeyFieldName', child_fk_comp.column_name,
              'primaryKeyFieldName', parent_pk_comp.column_name
            )
          )
      ) obj
    from information_schema.table_constraints child_tc
    -- To-one join for parent's pk constraint schema and name.
    join information_schema.referential_constraints child_rc on
      child_tc.constraint_schema = child_rc.constraint_schema and
      child_tc.constraint_name = child_rc.constraint_name
    -- To-one join for parent's pk constraint information.
    join information_schema.table_constraints parent_tc on
      parent_tc.table_schema = child_rc.unique_constraint_schema and
      parent_tc.table_name = child_rc.referenced_table_name and
      parent_tc.constraint_name = 'PRIMARY'
    -- To-many join for the field components of the foreign key in the child table.
    join information_schema.key_column_usage child_fk_comp on
      child_tc.constraint_schema = child_fk_comp.constraint_schema and
      child_tc.constraint_name = child_fk_comp.constraint_name
    -- To-one join for the parent table fk field component which is matched to that of the child.
    join information_schema.key_column_usage parent_pk_comp on
      parent_pk_comp.constraint_name = 'PRIMARY' and
      parent_pk_comp.table_schema  = parent_tc.table_schema and
      parent_pk_comp.table_name  = parent_tc.table_name
      and parent_pk_comp.ordinal_position = child_fk_comp.position_in_unique_constraint
    where child_tc.constraint_type = 'FOREIGN KEY'
      and child_fk_comp.table_schema not in (select * from ignoreSchemasQuery)
      and concat(child_tc.table_schema, '.', child_tc.table_name) regexp :relIncludePat
      and not (concat(child_tc.table_schema, '.', child_tc.table_name) regexp :relExcludePat)
      and concat(parent_tc.table_schema, '.', parent_tc.table_name) regexp :relIncludePat
      and not (concat(parent_tc.table_schema, '.', parent_tc.table_name) regexp :relExcludePat)
    group by
      child_tc.table_schema,
      child_tc.table_name,
      parent_tc.table_name,
      parent_tc.table_schema,
      child_tc.constraint_name
  ) fk
)
-- main query
select json_pretty(json_object(
  'dbmsName', 'MySQL',
  'dbmsVersion', version(),
  'caseSensitivity', 'SENSITIVE',
  'relationMetadatas', (select json from relationMetadatasQuery),
  'foreignKeys', (select json from foreignKeysQuery)
))
