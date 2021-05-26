import * as path from 'https://deno.land/std@0.97.0/path/mod.ts';
import {assertEquals, assertNotEquals, assert, assertThrows} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {DatabaseMetadata, foreignKeyFieldNames, relIdString, toRelId} from '../database-metadata.ts';

const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
const dbmdPath = path.join(scriptDir, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(Deno.readTextFileSync(dbmdPath));


Deno.test('can be initialized from stored properties', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  assert(!!dbmd);
});

Deno.test('fetch metadata for existing table by rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  assert(!!dbmd.getRelationMetadata({schema: 'drugs', name: 'authority'}));
});

Deno.test('do not fetch metadata for non-existing rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  assertEquals(dbmd.getRelationMetadata({schema: 'drugs', name: 'dne'}), null);
});

Deno.test('get single primary key field name', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const authTable = {schema: 'drugs', name: 'authority'};
  assertEquals(dbmd.getPrimaryKeyFieldNames(authTable), ["id"]);
  assertEquals(dbmd.getPrimaryKeyFieldNames(authTable, "a"), ["a.id"]);
});

Deno.test('get multiple primary key field names', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRef = {schema: 'drugs', name: 'drug_reference'};
  assertEquals(dbmd.getPrimaryKeyFieldNames(drugRef), ['drug_id', 'reference_id']);
  assertEquals(dbmd.getPrimaryKeyFieldNames(drugRef, "dr"), ['dr.drug_id', 'dr.reference_id']);
});

Deno.test('get unique foreign key from child to parent without specifying fk fields', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drug = {schema: 'drugs', name: 'drug'};
  const drugRef = {schema: 'drugs', name: 'drug_reference'};
  const fk = dbmd.getForeignKeyFromTo(drugRef, drug); // (from/to order intentionally reversed)
  assertEquals(fk?.constraintName, 'drug_reference_drug_fk');
});

Deno.test('get foreign key from child to parent when specifying fk field(s)', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  const fk = dbmd.getForeignKeyFromTo(compound, analyst, new Set(['entered_by']));
  assertEquals(fk?.constraintName, 'compound_enteredby_analyst_fk');
});

Deno.test('return no foreign key from child to parent when specifying non-existing fk field', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  const fk = dbmd.getForeignKeyFromTo(compound, analyst, new Set(['nonexisting_field']));
  assert(fk === null);
});

Deno.test('return null when foreign key does not exist between specified tables', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drug = {schema: 'drugs', name: 'drug'};
  const drugRef = {schema: 'drugs', name: 'drug_reference'};
  const fk = dbmd.getForeignKeyFromTo(drug, drugRef);
  assert(fk === null);
});

Deno.test('throw error if multiple foreign keys satisfy conditions for call to getForeignKeyFromTo()', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  assertThrows(() => dbmd.getForeignKeyFromTo(compound, analyst), Error, 'Multiple foreign key constraints exist');
});

Deno.test('get foreign key field names from foreign key', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  const fk = dbmd.getForeignKeyFromTo(compound, analyst, new Set(['entered_by']));
  assertEquals(foreignKeyFieldNames(fk!), ['entered_by']);
});

Deno.test('make rel ids with default schema applied', () => {
  assertEquals(
    toRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'),
    {schema: 'drugs', name: 'authority'}
  );
  assertEquals(
    toRelId('AUTHORITY', null, 'INSENSITIVE_STORED_LOWER'),
    {schema: null, name: 'authority'}
  );
  assertEquals(
    toRelId('authority', 'drugs', 'INSENSITIVE_STORED_UPPER'),
    {schema: 'DRUGS', name: 'AUTHORITY'}
  );
  assertEquals(
    toRelId('authority', null, 'INSENSITIVE_STORED_UPPER'),
    {schema: null, name: 'AUTHORITY'}
  );
});

Deno.test('make rel id by parsing qualified name', () => {
  assertEquals(
    toRelId('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_UPPER'),
    {schema: 'DRUGS', name: 'AUTHORITY'}
  );
  assertEquals(
    toRelId('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_LOWER'),
    {schema: 'drugs', name: 'authority'}
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
