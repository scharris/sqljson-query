import {QuerySpec} from '../query-specs';
import {DatabaseMetadata} from '../database-metadata';
import {QuerySqlGenerator} from '../query-sql-generator';
import {propertyNameDefaultFunction} from '../util';

const dbmdStoredProps = require('./dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');

test('unqualified tables are rejected when no default schema specified', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, null, new Set(), ccPropNameFn, 2); // no default schema
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug', // should not be found because unqualified with no default schema specified
        fieldExpressions: ['id'],
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/table 'drug'.* not found/i);
});

test('fully qualified table which exists in dbmd is accepted', () => {
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

  expect(sqlGen.generateSqls(querySpec).size).toBeGreaterThan(0);
});

test('non-existent table specified fully-qualifed causes error', () => {
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

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/table_which_dne/);
});

test('non-existent table specified with default schema causes error', () => {
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

 expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/table_which_dne/);
});

test('SQL is generated for each specified result representation', () => {
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
  expect(new Set(res.keys())).toEqual(new Set(['JSON_OBJECT_ROWS', 'JSON_ARRAY_ROW', 'MULTI_COLUMN_ROWS']));
});

test('result representation defaults to JSON_OBJECT_ROWS', () => {
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
  expect(new Set(res.keys())).toEqual(new Set(['JSON_OBJECT_ROWS']));
});

test('a table field which does not exist in datase metadata causes error', () => {
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

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/field_which_dne/i);
});

test('expression fields must specify json property', () => {
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

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/property name is required/i);
});

test('expression fields must specify field type in generated source', () => {
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

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/field type in generated source must be specified/i);
});

test('a table field/expresion specifying both field and expression values causes error', () => {
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

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/exactly one of 'field' or 'expression'/i);
});

test('a table field/expresion specifying neither field nor expression value causes error', () => {
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

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/exactly one of 'field' or 'expression'/i);
});

test('a non-existent child table causes error', () => {
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
            tableJson: {
              table: 'table_which_dne',
              fieldExpressions: ['id'],
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/table_which_dne/i);
});

test('a non-existent parent table causes error', () => {
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
            tableJson: {
              table: 'table_which_dne',
              fieldExpressions: ['id'],
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/table_which_dne/i);
});

test('a missing foreign key for a child collection causes error', () => {
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
            tableJson: {
              table: 'reference',
              fieldExpressions: ['id'],
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/no foreign key found/i);
});

test('a missing foreign key to parent table causes error', () => {
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
            tableJson: {
              table: 'reference',
              fieldExpressions: ['id'],
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/no foreign key found/i);
});

test('foreign key fields must be provided when multiple fk constraints exist for a child collection', () => {
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
            tableJson: {
              table: 'compound',
              fieldExpressions: ['id'],
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/multiple foreign key constraints exist/i);
});

test('providing foreign key fields avoids error when multiple fk constraints exist for child collection', () => {
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
            tableJson: {
              table: 'compound',
              fieldExpressions: ['id'],
            },
            foreignKeyFields: ['entered_by'] // disambiguates
          }
        ]
      }
    };

  expect(sqlGen.generateSqls(querySpec).size).toBe(1);
});

test('a custom join condition for a child table may be used when no suitable foreign key exists', () => {
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
            tableJson: {
              table: 'reference',
              fieldExpressions: ['id'],
            },
            customJoinCondition: {equatedFields: [{childField: 'id', parentPrimaryKeyField: 'id'}]}
          }
        ]
      }
    };

  expect(sqlGen.generateSqls(querySpec).size).toBe(1);
});

test('a custom join condition for a child table can only utilize fields which exist in datase metadata', () => {
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
            tableJson: {
              table: 'reference',
              fieldExpressions: ['id'],
            },
            customJoinCondition: {equatedFields: [{childField: 'id', parentPrimaryKeyField: 'field_which_dne'}]}
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec).size).toThrowError(/field_which_dne/i);
});

test('foreign key fields must be provided when multiple fk constraints exist to a parent table', () => {
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
            tableJson: {
              table: 'analyst',
              fieldExpressions: ['id'],
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/multiple foreign key constraints exist/i);
});

test('providing fk fields avoids error when multiple fk constraints exist with a parent table', () => {
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
            tableJson: {
              table: 'analyst',
              fieldExpressions: ['id'],
            },
            viaForeignKeyFields: ['entered_by'] // disambiguates
          }
        ]
      }
    };

  expect(sqlGen.generateSqls(querySpec).size).toBe(1);
});

test('a custom join condition for a parent table may be used when no suitable foreign key exists', () => {
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
            tableJson: {
              table: 'reference',
              fieldExpressions: ['id'],
            },
            customJoinCondition: {equatedFields: [{childField: 'id', parentPrimaryKeyField: 'id'}]}
          }
        ]
      }
    };

  expect(sqlGen.generateSqls(querySpec).size).toBe(1);
});

test('a custom join condition for a parent table can only utilize fields which exist in datase metadata', () => {
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
            tableJson: {
              table: 'reference',
              fieldExpressions: ['id'],
            },
            customJoinCondition: {equatedFields: [{childField: 'field_which_dne', parentPrimaryKeyField: 'id'}]}
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec).size).toThrowError(/field_which_dne/i);
});
