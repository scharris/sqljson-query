import * as path from 'path';
import * as fs from 'fs';
import {DatabaseMetadata, foreignKeyFieldNames, makeRelId, relIdsEqual} from '../dbmd';
import { relIdDescn } from '../util/database-names';

const dbmdPath = path.join(__dirname, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(fs.readFileSync(dbmdPath, 'utf8'));

test('can be initialized from stored properties', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  expect(dbmd).toBeTruthy();
});

test('fetch metadata for existing table by rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const relId = makeRelId('authority', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getRelationMetadata(relId)).toBeTruthy();
});

test('do not fetch metadata for non-existing rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const relId = makeRelId('dne', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getRelationMetadata(relId)).toBeNull();
});

test('get single primary key field name', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const authRelId = makeRelId('authority', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getPrimaryKeyFieldNames(authRelId)).toEqual(["id"]);
  expect(dbmd.getPrimaryKeyFieldNames(authRelId, "a")).toEqual(["a.id"]);
});

test('get multiple primary key field names', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRefRelId = makeRelId('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getPrimaryKeyFieldNames(drugRefRelId)).toEqual(['drug_id', 'reference_id']);
  expect(dbmd.getPrimaryKeyFieldNames(drugRefRelId, "dr")).toEqual(['dr.drug_id', 'dr.reference_id']);
});

test('get unique foreign key from child to parent without specifying fk fields', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRelId = makeRelId('drug', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const drugRefRelId = makeRelId('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(drugRefRelId, drugRelId); // (from/to order intentionally reversed)
  expect(fk?.constraintName).toEqual('drug_reference_drug_fk');
});

test('get foreign key from child to parent when specifying fk field(s)', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = makeRelId('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = makeRelId('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['entered_by']));
  expect(fk?.constraintName).toEqual('compound_enteredby_analyst_fk');
});

test('return no foreign key from child to parent when specifying non-existing fk field', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = makeRelId('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = makeRelId('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['nonexisting_field']));
  expect(fk).toBeNull();
});

test('return null when foreign key does not exist between specified tables', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRelId = makeRelId('drug', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const drugRefRelId = makeRelId('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(drugRelId, drugRefRelId);
  expect(fk).toBeNull();
});

test('throw error if multiple foreign keys satisfy conditions for call to getForeignKeyFromTo()', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = makeRelId('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = makeRelId('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(() => dbmd.getForeignKeyFromTo(compoundRelId, analystRelId))
  .toThrowError(/multiple foreign key constraints exist /i);
});

test('get foreign key field names from foreign key', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = makeRelId('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = makeRelId('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['entered_by']));
  expect(foreignKeyFieldNames(fk!)).toEqual(['entered_by']);
});

test('make rel ids with default schema applied', () => {
  expect(makeRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'authority'});
  expect(makeRelId('AUTHORITY', null, 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: null, name: 'authority'});
  expect(makeRelId('authority', 'drugs', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'AUTHORITY'});
  expect(makeRelId('authority', null, 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: null, name: 'AUTHORITY'});
});

test('make rel id by parsing qualified name', () => {
  expect(makeRelId('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'AUTHORITY'});
  expect(makeRelId('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'authority'});
});

test('make rel id by parsing qualified name with quoted parts', () => {
  expect(makeRelId('drugs."Authority"', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'Authority'});
  expect(makeRelId('"Drugs"."Authority"', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'Drugs', name: 'Authority'});
  expect(makeRelId('drugs."Authority"', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'Authority'});
  expect(makeRelId('"Drugs"."Authority"', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'Drugs', name: 'Authority'});
});

test('rel id string', () => {
  expect(relIdDescn(makeRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'))).toEqual('drugs.authority');
  expect(relIdDescn(makeRelId('Authority', 'Drugs', 'INSENSITIVE_STORED_UPPER'))).toEqual('DRUGS.AUTHORITY');
  expect(relIdDescn(makeRelId('authority', null, 'INSENSITIVE_STORED_UPPER'))).toEqual('AUTHORITY');
  expect(relIdDescn(makeRelId('authority', null, 'INSENSITIVE_STORED_LOWER'))).toEqual('authority');
});

test('rel ids equal', () => {
  expect(relIdsEqual(
    makeRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'),
    makeRelId('authority', 'drugs', 'INSENSITIVE_STORED_LOWER')
  ));
  expect(relIdsEqual(
    makeRelId('drugs.authority', null, 'INSENSITIVE_STORED_LOWER'),
    makeRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER')
  ));
  expect(!relIdsEqual(
    makeRelId('drugs.authority', null, 'INSENSITIVE_STORED_UPPER'),
    makeRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER')
  ));
  expect(!relIdsEqual(
    makeRelId('AUTHORITY', null, 'INSENSITIVE_STORED_UPPER'),
    makeRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_UPPER')
  ));
});
