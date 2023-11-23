with
ignoreSchemasQuery as (select 'temp' schema_name),
relationMetadatasQuery as (
  select
    json_object(
      'relationId', json_object('schema', m.schema, 'name', m.name),
      'relationType', m.type,
      'fields',
        coalesce(json_group_array(
          json_object(
            'name', p.name,
            'databaseType', case when p.type like 'varchar(%)' then 'varchar' else p.type end,
            'nullable', case when p."notnull" = 1 then json('false') else json('true') end,
            'primaryKeyPartNumber', case when p.pk > 0 then p.pk else null end
            -- 'length', null 'precision', null, 'precisionRadix', null, 'fractionalDigits', null
          )
        ), '[]')
    ) json
  from pragma_table_list as m
  join pragma_table_info(m.name) as p
  where m.schema not in (select schema_name from ignoreSchemasQuery)
  group by m.schema, m.name
),
foreignKeysQuery as (
  select
    json_object(
      'constraintName', 'fk_' || fk.id,
      'foreignKeyRelationId', json_object('schema', m.schema, 'name', m.name),
      'primaryKeyRelationId', json_object('schema', 'TODO', 'name', 'TODO'),
      'foreignKeyComponents',
        json_group_array(
          json_object(
            'foreignKeyFieldName', fk."from",
            'primaryKeyFieldName', 'TODO'
          )
        )
    ) json
  from pragma_table_list as m
  join pragma_foreign_key_list(m.name) fk
)
select json_object(
  'dbmsName', 'SQLite',
  'dbmsVersion', sqlite_version(),
  'caseSensitivity', 'INSENSITIVE_STORED_MIXED',
  'relationMetadatas', (select json from relationMetadatasQuery),
  'foreignKeys', (select json from foreignKeysQuery)
)