import {DatabaseMetadata, foreignKeyFieldNames, relIdString, toRelId} from '../database-metadata';

const dbmdStoredProps = require('./resources/dbmd.json');

test('can be initialized from stored properties', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  expect(dbmd).toBeTruthy();
});

test('fetch metadata for existing table by rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  expect(dbmd.getRelationMetadata({schema: 'drugs', name: 'authority'})).toBeTruthy();
});

test('do not fetch metadata for non-existing rel id', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  expect(dbmd.getRelationMetadata({schema: 'drugs', name: 'dne'})).toBeFalsy();
});

test('get single primary key field name', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const authTable = {schema: 'drugs', name: 'authority'};
  expect(dbmd.getPrimaryKeyFieldNames(authTable)).toEqual(["id"]);
  expect(dbmd.getPrimaryKeyFieldNames(authTable, "a")).toEqual(["a.id"]);
});

test('get multiple primary key field names', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drugRef = {schema: 'drugs', name: 'drug_reference'};
  expect(dbmd.getPrimaryKeyFieldNames(drugRef)).toEqual(['drug_id', 'reference_id']);
  expect(dbmd.getPrimaryKeyFieldNames(drugRef, "dr")).toEqual(['dr.drug_id', 'dr.reference_id']);
});

test('get unique foreign key from child to parent without specifying fk fields', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drug = {schema: 'drugs', name: 'drug'};
  const drugRef = {schema: 'drugs', name: 'drug_reference'};
  const fk = dbmd.getForeignKeyFromTo(drugRef, drug); // (from/to order intentionally reversed)
  expect(fk).toBeTruthy();
  if ( fk )
    expect(fk.constraintName).toBe('drug_reference_drug_fk');
});

test('get foreign key from child to parent when specifying fk field(s)', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  const fk = dbmd.getForeignKeyFromTo(compound, analyst, new Set(['entered_by']));
  expect(fk).toBeTruthy();
  if ( fk )
    expect(fk.constraintName).toBe('compound_enteredby_analyst_fk');
});

test('return no foreign key from child to parent when specifying non-existing fk field', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  const fk = dbmd.getForeignKeyFromTo(compound, analyst, new Set(['nonexisting_field']));
  expect(fk).toBeNull();
});

test('return null when foreign key does not exist between specified tables', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const drug = {schema: 'drugs', name: 'drug'};
  const drugRef = {schema: 'drugs', name: 'drug_reference'};
  const fk = dbmd.getForeignKeyFromTo(drug, drugRef);
  expect(fk).toBeNull();
});

test('throw error if multiple foreign keys satisfy conditions for call to getForeignKeyFromTo()', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  expect(() => dbmd.getForeignKeyFromTo(compound, analyst))
  .toThrowError(/multiple foreign key constraints exist /i);
});

test('get foreign key field names from foreign key', () => {
  const dbmd = new DatabaseMetadata(dbmdStoredProps);
  const compound = {schema: 'drugs', name: 'compound'};
  const analyst = {schema: 'drugs', name: 'analyst'};
  const fk = dbmd.getForeignKeyFromTo(compound, analyst, new Set(['entered_by']));
  expect(foreignKeyFieldNames(fk!)).toEqual(['entered_by']);
});

test('make rel id in stored-lower db', () => {
  expect(toRelId('AUTHORITY', 'DRUGS', 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: 'drugs', name: 'authority'});
  expect(toRelId('AUTHORITY', null, 'INSENSITIVE_STORED_LOWER'))
    .toEqual({schema: null, name: 'authority'});
});

test('make rel id in stored-upper db', () => {
  expect(toRelId('authority', 'drugs', 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: 'DRUGS', name: 'AUTHORITY'});
  expect(toRelId('authority', null, 'INSENSITIVE_STORED_UPPER'))
    .toEqual({schema: null, name: 'AUTHORITY'});
});

test('rel id string', () => {
  expect(relIdString({schema: 'DRUGS', name: 'AUTHORITY'})).toEqual('DRUGS.AUTHORITY');
  expect(relIdString({schema: null, name: 'AUTHORITY'})).toEqual('AUTHORITY');
  expect(relIdString({schema: 'drugs', name: 'authority'})).toEqual('drugs.authority');
  expect(relIdString({schema: null, name: 'authority'})).toEqual('authority');
});

test('rel ids equal', () => {
  expect({schema: 'DRUGS', name: 'AUTHORITY'}).toEqual({schema: 'DRUGS', name: 'AUTHORITY'});
  expect({schema: null, name: 'AUTHORITY'}).toEqual({schema: null, name: 'AUTHORITY'});
  expect({schema: 'drugs', name: 'authority'}).toEqual({schema: 'drugs', name: 'authority'});
  expect({schema: null, name: 'authority'}).toEqual({schema: null, name: 'authority'});
  expect({schema: 'DRUGS', name: 'AUTHORITY'}).not.toEqual({schema: 'DRUGS', name: 'authority'});
  expect({schema: 'DRUGS', name: 'AUTHORITY'}).not.toEqual({schema: 'drugs', name: 'AUTHORITY'});
  expect({schema: null, name: 'AUTHORITY'}).not.toEqual({schema: null, name: 'authority'});
});
