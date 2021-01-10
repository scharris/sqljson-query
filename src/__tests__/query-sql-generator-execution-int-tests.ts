import {propertyNameDefaultFunction} from '../util';
import {QuerySpec} from '..';
import {DatabaseMetadata} from '../database-metadata';
import {QuerySqlGenerator} from '../query-sql-generator';
import {DbHandle, getDbHandle} from './db/db-handle';

const dbType = process.env.TEST_DB_TYPE || 'pg';

const dbmdStoredProps = require(`./db/${dbType}/dbmd.json`);
const db: DbHandle = getDbHandle(dbType);
afterAll(async () => {
  await db.end();
});

const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');

if ( ['1','y','Y','true', 'True'].includes(process.env['SKIP_INTEGRATION_TESTS'] || '0') )
  test.only('skipping integration tests', () => {
    console.warn('skipping integration tests - unset environment variable SKIP_INTEGRATION_TESTS to include');
  });

test('query of single table for json object rows results', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBeGreaterThan(1);
  const firstJson = res.rows[0].json;
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof firstJson['id']).toBe('number');
  expect(typeof firstJson['name']).toBe('string');
});

test('query of single table for json array row results', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_ARRAY_ROW'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_ARRAY_ROW') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const jsonArray: any[] = res.rows[0].json;
  expect(jsonArray.length).toBeGreaterThan(1);
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof jsonArray[0]['id']).toBe('number');
  expect(typeof jsonArray[0]['name']).toBe('string');
});

test('query of single table for multi column rows results', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['MULTI_COLUMN_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('MULTI_COLUMN_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBeGreaterThan(1);
  const firstRow = res.rows[0];
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof firstRow['id']).toBe('number');
  expect(typeof firstRow['name']).toBe('string');
});

test('record condition properly restricts results for top level table', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        recordCondition: {sql: '$$.id = 1'}
      },
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.id).toBe(1);
  expect(json.name).toBe('Test Drug 1');
});

test('simple table field property names specified by jsonProperty', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: [
          {
            'field': 'id',
            'jsonProperty': 'drugId'
          },
          {
            'field': 'name',
            'jsonProperty': 'drugName'
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      },
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.drugId).toBe(1);
  expect(json.drugName).toBe('Test Drug 1');
});

test('simple table field property names default according to the provided naming function', async () => {
  const appendX = (fieldName: string) => fieldName + "X";
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), appendX, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        recordCondition: {sql: '$$.id = 1'}
      },
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.idX).toBe(1);
  expect(json.nameX).toBe('Test Drug 1');
});

test('non-unwrapped child table collection', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            tableJson: {
              table: 'compound',
              fieldExpressions: ['id', 'display_name'],
            },
            foreignKeyFields: ['entered_by'],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(Object.keys(json.compoundsEntered[0]))).toEqual(new Set(['id', 'displayName']));
  expect(new Set(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`)))
    .toEqual(new Set(['2|Test Compound 2', '4|Test Compound 4']));
});

test('unwrapped child table collection of simple table field property', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            unwrap: true,
            tableJson: {
              table: 'compound',
              fieldExpressions: ['id'],
            },
            foreignKeyFields: ['entered_by'],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(json.compoundsEntered)).toEqual(new Set([2,4]));
});

test('unwrapped child table collection of field exression property', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            unwrap: true,
            tableJson: {
              table: 'compound',
              fieldExpressions: [
                { expression: 'lower(display_name)', jsonProperty: 'lcName', fieldTypeInGeneratedSource: 'string' }
              ]
            },
            foreignKeyFields: ['entered_by'],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(json.compoundsEntered)).toEqual(new Set(['test compound 2', 'test compound 4']));
});

test('unwrapped child table collection of parent reference property', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        childTables: [
          {
            collectionName: 'drugAnalysts',
            unwrap: true,
            tableJson: {
              table: 'drug',
              parentTables: [
                {
                  referenceName: 'registeredBy',
                  tableJson: {
                    table: 'analyst',
                    fieldExpressions: ['id', 'short_name']
                  }
                }
              ]
            },
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.drugAnalysts.length).toBe(1);
  const drugAnalyst: any = json.drugAnalysts[0];
  expect(drugAnalyst.id).toBe(1);
  expect(drugAnalyst.shortName).toBe('jdoe');
});

test('unwrapped child table collection of inlined parent property', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        childTables: [
          {
            collectionName: 'drugRegisteringAnalystIds',
            unwrap: true,
            tableJson: {
              table: 'drug',
              parentTables: [
                {
                  tableJson: {
                    table: 'analyst',
                    fieldExpressions: ['id']
                  }
                }
              ]
            },
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.drugRegisteringAnalystIds).toEqual([1]);
});

test('unwrapped child collection of child collection property', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        childTables: [
          {
            collectionName: 'drugAdvisories',
            unwrap: true,
            tableJson: {
              table: 'drug',
              childTables: [
                {
                  collectionName: 'advisories',
                  unwrap: false,
                  tableJson: {
                    table: 'advisory',
                    fieldExpressions: ['id', 'advisory_type_id']
                  }
                }
              ]
            },
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.drugAdvisories.length).toEqual(1);
  const advisories = json.drugAdvisories[0];
  expect(advisories.length).toEqual(3);
  expect(new Set(Object.keys(advisories[0]))).toEqual(new Set(['id', 'advisoryTypeId']));
  expect(new Set(advisories.map((a: any) => `${a.id}|${a.advisoryTypeId}`)))
    .toEqual(new Set(['101|1',  '102|2', '123|3']));
});

test('unwrapped child collection of unwrapped child collection property', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        childTables: [
          {
            collectionName: 'drugAdvisoryTypeIds',
            unwrap: true,
            tableJson: {
              table: 'drug',
              childTables: [
                {
                  collectionName: 'advisories',
                  unwrap: true,
                  tableJson: {
                    table: 'advisory',
                    fieldExpressions: ['advisory_type_id']
                  }
                }
              ]
            },
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.drugAdvisoryTypeIds.length).toEqual(1);
  const advisoryTypeIds = json.drugAdvisoryTypeIds[0];
  expect(new Set(advisoryTypeIds)).toEqual(new Set([1,2,3]));
});

test('unwrapped child collection with element type containing more than one property should cause error', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        childTables: [
          {
            collectionName: 'advisoryTypeIdLists',
            unwrap: true,
            tableJson: {
              table: 'drug',
              fieldExpressions: ['id', 'name']
            }
          }
        ]
      }
    };

  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(
    /incompatible with multiple field expressions/i
  );
});

test('order-by specification determines ordering in a child table collection', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            tableJson: {
              table: 'compound',
              fieldExpressions: ['id', 'display_name'],
            },
            foreignKeyFields: ['entered_by'],
            orderBy: '$$.id desc'
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`))
    .toEqual(['4|Test Compound 4', '2|Test Compound 2']);
});

test('referenced parent table', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        fieldExpressions: ['id'],
        parentTables: [
          {
            referenceName: 'enteredByAnalyst',
            tableJson: {
              table: 'analyst',
              fieldExpressions: ['id', 'short_name']
            },
            viaForeignKeyFields: ['entered_by']
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(Object.keys(json.enteredByAnalyst))).toEqual(new Set(['id', 'shortName']));
  expect(json.enteredByAnalyst.id).toBe(2);
  expect(json.enteredByAnalyst.shortName).toBe('sch');
});

test('simple table field properties from inline parent tables', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        fieldExpressions: ['id'],
        parentTables: [
          {
            tableJson: {
              table: 'analyst',
              fieldExpressions: [
                { field: 'id', jsonProperty: 'analystId' },
                { field: 'short_name', jsonProperty: 'analystShortName' }
              ]
            },
            viaForeignKeyFields: ['entered_by']
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(Object.keys(json))).toEqual(new Set(['id', 'analystId', 'analystShortName']));
  expect(json.id).toBe(1);
  expect(json.analystId).toBe(2);
  expect(json.analystShortName).toBe('sch');
});

test('simple field properties from an inlined parent and its own inlined parent', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        parentTables: [
          {
            tableJson: {
              table: 'compound',
              fieldExpressions: [
                { field: 'id', jsonProperty: 'compoundId' },
                { field: 'display_name', jsonProperty: 'compoundDisplayName' }
              ],
              parentTables: [
                {
                  tableJson: {
                    table: 'analyst',
                    fieldExpressions: [
                      { field: 'short_name', jsonProperty: 'compoundApprovedBy' }
                    ],
                  },
                  viaForeignKeyFields: ['approved_by']
                }
              ]
            }
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(Object.keys(json))).toEqual(new Set([
    'id', 'name', // from top-level table
    'compoundId', 'compoundDisplayName', // from inlined compound parent
    'compoundApprovedBy' // from inlined analyst parent of compound
  ]));
  expect(json.id).toBe(1);
  expect(json.name).toBe('Test Drug 1');
  expect(json.compoundId).toBe(1);
  expect(json.compoundDisplayName).toBe('Test Compound 1');
  expect(json.compoundApprovedBy).toBe('jdoe');
});

test('referenced parent property from an inlined parent', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        parentTables: [
          {
            tableJson: {
              table: 'compound',
              parentTables: [
                {
                  referenceName: 'enteredByAnalyst',
                  tableJson: {
                    table: 'analyst',
                    fieldExpressions: ['id', 'short_name'],
                  },
                  viaForeignKeyFields: ['entered_by']
                },
              ]
            }
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const res = await db.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(Object.keys(json))).toEqual(new Set([
    'id', 'name', // from top-level "drug" table
    'enteredByAnalyst' // from analyst parent of inlined parent table "compound"
  ]));
  expect(json.id).toBe(1);
  expect(json.name).toBe('Test Drug 1');
  expect(new Set(Object.keys(json.enteredByAnalyst))).toEqual(new Set(['id', 'shortName']));
  expect(json.enteredByAnalyst.id).toBe(2);
  expect(json.enteredByAnalyst.shortName).toBe('sch');
});
