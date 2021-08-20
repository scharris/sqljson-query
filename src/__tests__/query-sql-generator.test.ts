import * as path from 'https://deno.land/std@0.97.0/path/mod.ts';
import {assertEquals, assertThrows, assert} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {QuerySpec} from '../query-specs.ts';
import {DatabaseMetadata} from '../database-metadata.ts';
import {QuerySqlGenerator} from '../query-sql-generator.ts';
import {propertyNameDefaultFunction} from '../util/mod.ts';

const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
const dbmdPath = path.join(scriptDir, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(Deno.readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');

Deno.test('unqualified tables are rejected when no default schema specified', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, null, new Set(), ccPropNameFn, 2); // no default schema
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug', // should not be found because unqualified with no default schema specified
        fieldExpressions: ['id'],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'Table \'drug\' was not found');
});

Deno.test('fully qualified table which exists in dbmd is accepted', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, null, new Set(), ccPropNameFn, 2); // no default schema
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drugs.drug',
        fieldExpressions: ['id'],
      }
    };

  assert(sqlGen.generateSqls(querySpec).size > 0);
});

Deno.test('non-existent table specified fully-qualifed causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, null, new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drugs.table_which_dne',
        fieldExpressions: ['id'],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'table_which_dne');
});

Deno.test('non-existent table specified with default schema causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'table_which_dne',
        fieldExpressions: ['id'],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'table_which_dne');
});

Deno.test('SQL is generated for each specified result representation', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(['drugs']), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS', 'JSON_ARRAY_ROW', 'MULTI_COLUMN_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const res = sqlGen.generateSqls(querySpec);
  assertEquals(
    new Set(res.keys()),
    new Set(['JSON_OBJECT_ROWS', 'JSON_ARRAY_ROW', 'MULTI_COLUMN_ROWS'])
  );
});

Deno.test('result representation defaults to JSON_OBJECT_ROWS', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(['drugs']), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const res = sqlGen.generateSqls(querySpec);
  assertEquals(
    new Set(res.keys()),
    new Set(['JSON_OBJECT_ROWS'])
  );
});

Deno.test('a table field which does not exist in datase metadata causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['field_which_dne'],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'field_which_dne');
});

Deno.test('expression fields must specify json property', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: [ { expression: '2 + 2', fieldTypeInGeneratedSource: 'number' } ],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'property name is required');
});

Deno.test('expression fields must specify field type in generated source', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: [ { expression: '2 + 2', jsonProperty: 'twiceTwo' } ],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'field type in generated source must be specified');
});

Deno.test('a table field/expresion specifying both field and expression values causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: [
          { field: 'id', expression: '2 + 2', jsonProperty: 'twiceTwo', fieldTypeInGeneratedSource: 'number' }
        ],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'exactly one of \'field\' or \'expression\'');
});

Deno.test('a table field/expresion specifying neither field nor expression value causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: [
          { jsonProperty: 'twiceTwo', fieldTypeInGeneratedSource: 'number' }
        ],
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'exactly one of \'field\' or \'expression\'');
});

Deno.test('a non-existent child table causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        childTables: [
          {
            collectionName: 'references',
            table: 'table_which_dne',
            fieldExpressions: ['id'],
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'table_which_dne');
});

Deno.test('a non-existent parent table causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'table_which_dne',
            fieldExpressions: ['id'],
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'table_which_dne');
});

Deno.test('a missing foreign key for a child collection causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        childTables: [
          {
            collectionName: 'references',
            table: 'reference',
            fieldExpressions: ['id'],
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'No foreign key found');
});

Deno.test('a missing foreign key to parent table causes error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'reference',
            fieldExpressions: ['id'],
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'No foreign key found');
});

Deno.test('foreign key fields must be provided when multiple fk constraints exist for a child collection', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'analyst',
        fieldExpressions: ['id'],
        childTables: [
          {
            collectionName: 'compounds', // compounds has multiple fks to analyst (for entered_by and approved_by)
            table: 'compound',
            fieldExpressions: ['id'],
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'Multiple foreign key constraints exist');
});

Deno.test('providing foreign key fields avoids error when multiple fk constraints exist for child collection', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'analyst',
        fieldExpressions: ['id'],
        childTables: [
          {
            collectionName: 'compounds', // compounds has multiple fks to analyst (for entered_by and approved_by)
            table: 'compound',
            fieldExpressions: ['id'],
            foreignKeyFields: ['entered_by'] // disambiguates
          }
        ]
      }
    };

  assertEquals(sqlGen.generateSqls(querySpec).size, 1);
});

Deno.test('a custom join condition for a child table may be used when no suitable foreign key exists', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        childTables: [
          {
            collectionName: 'references',
            table: 'reference',
            fieldExpressions: ['id'],
            customJoinCondition: {equatedFields: [{childField: 'id', parentPrimaryKeyField: 'id'}]}
          }
        ]
      }
    };

  assertEquals(sqlGen.generateSqls(querySpec).size, 1);
});

Deno.test('a custom join condition for a child table can only utilize fields which exist in datase metadata', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        childTables: [
          {
            collectionName: 'references',
            table: 'reference',
            fieldExpressions: ['id'],
            customJoinCondition: {equatedFields: [{childField: 'id', parentPrimaryKeyField: 'field_which_dne'}]}
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec).size, Error, 'field_which_dne');
});

Deno.test('foreign key fields must be provided when multiple fk constraints exist to a parent table', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'compound',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'analyst',
            fieldExpressions: ['id'],
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'Multiple foreign key constraints exist');
});

Deno.test('providing fk fields avoids error when multiple fk constraints exist with a parent table', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'compound',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'analyst',
            fieldExpressions: ['id'],
            viaForeignKeyFields: ['entered_by'] // disambiguates
          }
        ]
      }
    };

  assertEquals(sqlGen.generateSqls(querySpec).size, 1);
});

Deno.test('a custom join condition for a parent table may be used when no suitable foreign key exists', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'reference',
            fieldExpressions: ['id'],
            customJoinCondition: {equatedFields: [{childField: 'id', parentPrimaryKeyField: 'id'}]}
          }
        ]
      }
    };

  assertEquals(sqlGen.generateSqls(querySpec).size, 1);
});

Deno.test('a custom join condition for a parent table can only utilize fields which exist in datase metadata', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'reference',
            fieldExpressions: ['id'],
            customJoinCondition: {equatedFields: [{childField: 'field_which_dne', parentPrimaryKeyField: 'id'}]}
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec).size, Error, 'field_which_dne');
});
