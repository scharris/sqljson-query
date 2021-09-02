import {assertEquals} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {
  caseNormalizeName,
  getSchemaName,
  getRelationName,
  splitSchemaAndRelationNames
} from '../util/database-names.ts';

Deno.test('nromalize quoted name as quoted for stored-lowercase db', () => {
  assertEquals(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_LOWER'), '"mC"');
});

Deno.test('normalize quoted name as quoted for stored-uppercase db', () => {
  assertEquals(caseNormalizeName('"mC"', 'INSENSITIVE_STORED_UPPER'), '"mC"');
});

Deno.test('normalize unquoted name to uppercase for stored-uppercase db', () => {
  assertEquals(caseNormalizeName('mC', 'INSENSITIVE_STORED_UPPER'), 'MC');
});

Deno.test('normalize unquoted name to lowercase for stored-lowercase db', () => {
  assertEquals(caseNormalizeName('mC', 'INSENSITIVE_STORED_LOWER'), 'mc');
});


Deno.test('unquoted schema name is extracted from qualified name', () => {
  assertEquals(getSchemaName('myschema.mytable'), 'myschema');
});

Deno.test('quoted schema name is extracted from qualified name', () => {
  assertEquals(getSchemaName('"myschema".mytable'), '"myschema"');
});

Deno.test('quoted schema name containing dot is extracted from qualified name', () => {
  assertEquals(getSchemaName('"my.schema".mytable'), '"my.schema"');
});

Deno.test('extracted schema name is null given an unqualified relation name', () => {
  assertEquals(getSchemaName('mytable'), null);
});

Deno.test('extracted schema name is null given an unqualifed and quoted relation name', () => {
  assertEquals(getSchemaName('"mytable"'), null);
});


Deno.test('unquoted relation name is extracted from qualified name', () => {
  assertEquals(getRelationName('myschema.mytable'), 'mytable');
});

Deno.test('quoted relation name is extracted from qualified name', () => {
  assertEquals(getRelationName('myschema."mytable"'), '"mytable"');
});

Deno.test('quoted relation name containing dot is extracted from qualified name', () => {
  assertEquals(getRelationName('"my.schema"."my.table"'), '"my.table"');
});

Deno.test('relation name is extracted for an unqualified relation name', () => {
  assertEquals(getRelationName('mytable'), 'mytable');
});

Deno.test('relation name is extracted for an unqualified and quoted relation name', () => {
  assertEquals(getRelationName('"mytable"'), '"mytable"');
});

Deno.test('fully qualified name with quoted parts splits properly', () => {
  assertEquals(splitSchemaAndRelationNames('"my.schema"."mytable"'), ['"my.schema"', '"mytable"']);
});

Deno.test('fully qualified name with unquoted parts splits properly', () => {
  assertEquals(splitSchemaAndRelationNames('myschema.mytable'), ['myschema', 'mytable']);
});

Deno.test('fully qualified name with quoted relation part splits properly', () => {
  assertEquals(splitSchemaAndRelationNames('myschema."mytable"'), ['myschema', '"mytable"']);
});
