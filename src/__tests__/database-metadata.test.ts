import * as path from 'path';
import * as fs from 'fs';
import {DatabaseMetadata, foreignKeyFieldNames, RelId, relIdsEqual} from '../database-metadata';
import { relIdDescr } from '../util/database-names';

const dbmdPath = path.join(__dirname, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(fs.readFileSync(dbmdPath, 'utf8'));

test('can be initialized from stored properties', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  expect(dbmd).toBeTruthy();
});

test('fetch metadata for existing table by rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const relId = RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getRelationMetadata(relId)).toBeTruthy();
});

test('do not fetch metadata for non-existing rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const relId = RelId.make('dne', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getRelationMetadata(relId)).toBeNull();
});

test('get single primary key field name', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const authRelId = RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getPrimaryKeyFieldNames(authRelId)).toEqual(["id"]);
  expect(dbmd.getPrimaryKeyFieldNames(authRelId, "a")).toEqual(["a.id"]);
});

test('get multiple primary key field names', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRefRelId = RelId.make('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(dbmd.getPrimaryKeyFieldNames(drugRefRelId)).toEqual(['drug_id', 'reference_id']);
  expect(dbmd.getPrimaryKeyFieldNames(drugRefRelId, "dr")).toEqual(['dr.drug_id', 'dr.reference_id']);
});

test('get unique foreign key from child to parent without specifying fk fields', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRelId = RelId.make('drug', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const drugRefRelId = RelId.make('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(drugRefRelId, drugRelId); // (from/to order intentionally reversed)
  expect(fk?.constraintName).toEqual('drug_reference_drug_fk');
});

test('get foreign key from child to parent when specifying fk field(s)', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['entered_by']));
  expect(fk?.constraintName).toEqual('compound_enteredby_analyst_fk');
});

test('return no foreign key from child to parent when specifying non-existing fk field', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['nonexisting_field']));
  expect(fk).toBeNull();
});

test('return null when foreign key does not exist between specified tables', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRelId = RelId.make('drug', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const drugRefRelId = RelId.make('drug_reference', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(drugRelId, drugRefRelId);
  expect(fk).toBeNull();
});

test('throw error if multiple foreign keys satisfy conditions for call to getForeignKeyFromTo()', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  expect(() => dbmd.getForeignKeyFromTo(compoundRelId, analystRelId))
  .toThrowError(/multiple foreign key constraints exist /i);
});

test('get foreign key field names from foreign key', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compoundRelId = RelId.make('compound', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const analystRelId = RelId.make('analyst', 'drugs', 'INSENSITIVE_STORED_LOWER');
  const fk = dbmd.getForeignKeyFromTo(compoundRelId, analystRelId, new Set(['entered_by']));
  expect(foreignKeyFieldNames(fk!)).toEqual(['entered_by']);
});

test('make rel ids with default schema applied', () => {
  expect(RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'authority'});
  expect(RelId.make('AUTHORITY', null, 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: null, name: 'authority'});
  expect(RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'AUTHORITY'});
  expect(RelId.make('authority', null, 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: null, name: 'AUTHORITY'});
});

test('make rel id by parsing qualified name', () => {
  expect(RelId.make('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'AUTHORITY'});
  expect(RelId.make('drugs.authority', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'authority'});
});

test('make rel id by parsing qualified name with quoted parts', () => {
  expect(RelId.make('drugs."Authority"', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'Authority'});
  expect(RelId.make('"Drugs"."Authority"', 'default_schema', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'Drugs', name: 'Authority'});
  expect(RelId.make('drugs."Authority"', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'Authority'});
  expect(RelId.make('"Drugs"."Authority"', 'default_schema', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'Drugs', name: 'Authority'});
});

test('rel id string', () => {
  expect(relIdDescr(RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'))).toEqual('drugs.authority');
  expect(relIdDescr(RelId.make('Authority', 'Drugs', 'INSENSITIVE_STORED_UPPER'))).toEqual('DRUGS.AUTHORITY');
  expect(relIdDescr(RelId.make('authority', null, 'INSENSITIVE_STORED_UPPER'))).toEqual('AUTHORITY');
  expect(relIdDescr(RelId.make('authority', null, 'INSENSITIVE_STORED_LOWER'))).toEqual('authority');
});

test('rel ids equal', () => {
  expect(relIdsEqual(
    RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'),
    RelId.make('authority', 'drugs', 'INSENSITIVE_STORED_LOWER')
  ));
  expect(relIdsEqual(
    RelId.make('drugs.authority', null, 'INSENSITIVE_STORED_LOWER'),
    RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER')
  ));
  expect(!relIdsEqual(
    RelId.make('drugs.authority', null, 'INSENSITIVE_STORED_UPPER'),
    RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER')
  ));
  expect(!relIdsEqual(
    RelId.make('AUTHORITY', null, 'INSENSITIVE_STORED_UPPER'),
    RelId.make('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_UPPER')
  ));
});
