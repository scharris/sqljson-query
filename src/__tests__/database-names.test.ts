import {
  caseNormalizeName,
  getSchemaName,
  getRelationName,
  splitSchemaAndRelationNames
} from '../util/database-names';

test('nromalize quoted name as quoted for stored-lowercase db', () => {
  expect(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_LOWER')).toBe('"mC"');
});

test('normalize quoted name as quoted for stored-uppercase db', () => {
  expect(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_UPPER')).toBe('"mC"');
});

test('normalize unquoted name to uppercase for stored-uppercase db', () => {
  expect(caseNormalizeName('mC', 'INSENSITIVE_STORED_UPPER')).toBe('MC');
});

test('normalize unquoted name to lowercase for stored-lowercase db', () => {
  expect(caseNormalizeName('mC', 'INSENSITIVE_STORED_LOWER')).toBe('mc');
});


test('unquoted schema name is extracted from qualified name', () => {
  expect(getSchemaName('myschema.mytable')).toBe('myschema');
});

test('quoted schema name is extracted from qualified name', () => {
  expect(getSchemaName('"myschema".mytable')).toBe('"myschema"');
});

test('quoted schema name containing dot is extracted from qualified name', () => {
  expect(getSchemaName('"my.schema".mytable')).toBe('"my.schema"');
});

test('extracted schema name is null given an unqualified relation name', () => {
  expect(getSchemaName('mytable')).toBeNull();
});

test('extracted schema name is null given an unqualifed and quoted relation name', () => {
  expect(getSchemaName('"mytable"')).toBeNull();
});


test('unquoted relation name is extracted from qualified name', () => {
  expect(getRelationName('myschema.mytable')).toBe('mytable');
});

test('quoted relation name is extracted from qualified name', () => {
  expect(getRelationName('myschema."mytable"')).toBe('"mytable"');
});

test('quoted relation name containing dot is extracted from qualified name', () => {
  expect(getRelationName('"my.schema"."my.table"')).toBe('"my.table"');
});

test('relation name is extracted for an unqualified relation name', () => {
  expect(getRelationName('mytable')).toBe('mytable');
});

test('relation name is extracted for an unqualified and quoted relation name', () => {
  expect(getRelationName('"mytable"')).toBe('"mytable"');
});

test('fully qualified name with quoted parts splits properly', () => {
  expect(splitSchemaAndRelationNames('"my.schema"."mytable"')).toStrictEqual(['"my.schema"', '"mytable"']);
});

test('fully qualified name with unquoted parts splits properly', () => {
  expect(splitSchemaAndRelationNames('myschema.mytable')).toStrictEqual(['myschema', 'mytable']);
});

test('fully qualified name with quoted relation part splits properly', () => {
  expect(splitSchemaAndRelationNames('myschema."mytable"')).toStrictEqual(['myschema', '"mytable"']);
});
