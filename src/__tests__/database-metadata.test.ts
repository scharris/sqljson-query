import * as path from 'https://deno.land/std@0.97.0/path/mod.ts';
import {assertEquals, assertNotEquals, assert, assertThrows} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {DatabaseMetadata, foreignKeyFieldNames, RelId} from '../database-metadata.ts';

const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
const dbmdPath = path.join(scriptDir, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(Deno.readTextFileSync(dbmdPath));


Deno.test('can be initialized from stored properties', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  assert(!!dbmd);
});

Deno.test('fetch metadata for existing table by rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const relId = RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_LOWER');
  assert(!!dbmd.getRelationMetadata(relId));
});

Deno.test('do not fetch metadata for non-existing rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const relId = RelId.make('dne', 'drugs', 'INSENSITIVE_STORED_LOWER');
  assertEquals(dbmd.getRelationMetadata(relId), null);
});

Deno.test('get single primary key field name', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const authRelId = RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_LOWER');
  assertEquals(dbmd.getPrimaryKeyFieldNames(authRelId), ["id"]);
  assertEquals(dbmd.getPrimaryKeyFieldNames(authRelId, "a"), ["a.id"]);
});

Deno.test('get multiple primary key field names', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRefRelId = RelId.make('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  assertEquals(dbmd.getPrimaryKeyFieldNames(drugRefRelId), ['drug_id', 'reference_id']);
  assertEquals(dbmd.getPrimaryKeyFieldNames(drugRefRelId, "dr"), ['dr.drug_id', 'dr.reference_id']);
});

Deno.test('get unique foreign key from child to parent without specifying fk fields', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRelId = RelId.make('drug', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const drugRefRelId = RelId.make('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(drugRefRelId, drugRelId); // (from/to order intentionally reversed)
  assertEquals(fk?.constraintName, 'drug_reference_drug_fk');
});

Deno.test('get foreign key from child to parent when specifying fk field(s)', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['entered_by']));
  assertEquals(fk?.constraintName, 'compound_enteredby_analyst_fk');
});

Deno.test('return no foreign key from child to parent when specifying non-existing fk field', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId new Set(['nonexisting_field']));
  assert(fk === null);
});

Deno.test('return null when foreign key does not exist between specified tables', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRelId = RelId.make('drug', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const drugRefRelId = RelId.make('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(drugRelId, drugRefRelId);
  assert(fk === null);
});

Deno.test('throw error if multiple foreign keys satisfy conditions for call to getForeignKeyFromTo()', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  assertThrows(() => dbmd.getForeignKeyFromTo(compoundRelId, analystRelId), Error, 'Multiple foreign key constraints exist');
});

Deno.test('get foreign key field names from foreign key', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['entered_by']));
  assertEquals(foreignKeyFieldNames(fk!), ['entered_by']);
});

Deno.test('make rel ids with default schema applied', () => {
  assertEquals(
    RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'),
    {schema: 'drugs', name: 'authority'}
  );
  assertEquals(
    RelId.make('AUTHORITY', null, 'INSENSITIVE_STORED_LOWER'),
    {schema: null, name: 'authority'}
  );
  assertEquals(
    RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_UPPER'),
    {schema: 'DRUGS', name: 'AUTHORITY'}
  );
  assertEquals(
    RelId.make('authority', null, 'INSENSITIVE_STORED_UPPER'),
    {schema: null, name: 'AUTHORITY'}
  );
});

Deno.test('make rel id by parsing qualified name', () => {
  assertEquals(
    RelId.make('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_UPPER'),
    {schema: 'DRUGS', name: 'AUTHORITY'}
  );
  assertEquals(
    RelId.make('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_LOWER'),
    {schema: 'drugs', name: 'authority'}
  );
});

test('make rel id by parsing qualified name with quoted parts', () => {
  assertEquals(
    RelId.make('drugs."Authority"', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    {schema: 'DRUGS', name: 'Authority'}
  );
  assertEquals(
    RelId.make('"Drugs"."Authority"', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    {schema: 'Drugs', name: 'Authority'}
  );
  assertEquals(
    RelId.make('drugs."Authority"', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    {schema: 'drugs', name: 'Authority'}
  );
  assertEquals(
    RelId.make('"Drugs"."Authority"', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    {schema: 'Drugs', name: 'Authority'}
  );
});

Deno.test('rel id string', () => {
  assertEquals(relIdString({schema: 'DRUGS', name: 'AUTHORITY'}), 'DRUGS.AUTHORITY');
  assertEquals(relIdString({schema: null, name: 'AUTHORITY'}), 'AUTHORITY');
  assertEquals(relIdString({schema: 'drugs', name: 'authority'}), 'drugs.authority');
  assertEquals(relIdString({schema: null, name: 'authority'}), 'authority');
});

Deno.test('rel ids equal', () => {
  assertEquals({schema: 'DRUGS', name: 'AUTHORITY'}, {schema: 'DRUGS', name: 'AUTHORITY'});
  assertEquals({schema: null, name: 'AUTHORITY'}, {schema: null, name: 'AUTHORITY'});
  assertEquals({schema: 'drugs', name: 'authority'}, {schema: 'drugs', name: 'authority'});
  assertEquals({schema: null, name: 'authority'}, {schema: null, name: 'authority'});
  assertNotEquals({schema: 'DRUGS', name: 'AUTHORITY'}, {schema: 'DRUGS', name: 'authority'});
  assertNotEquals({schema: 'DRUGS', name: 'AUTHORITY'}, {schema: 'drugs', name: 'AUTHORITY'});
  assertNotEquals({schema: null, name: 'AUTHORITY'}, {schema: null, name: 'authority'});
});
