import {Client as PgClient, QueryResult} from 'pg';
import {propertyNameDefaultFunction} from '../util';
import {QuerySpec} from '..';
import {DatabaseMetadata} from '../database-metadata';
import {QuerySqlGenerator} from '../query-sql-generator';

const dbmdStoredProps = require('./resources/dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');

test('query of single table for json object rows results should have proper result structure', async () => {
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
  const res = await execSql(sql);
  expect(res.rows.length).toBeGreaterThan(1);
  const firstJson = res.rows[0].json;
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof firstJson['id']).toBe('number');
  expect(typeof firstJson['name']).toBe('string');
});

test('query of single table for json array row results should have proper result structure', async () => {
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
  const res = await execSql(sql);
  expect(res.rows.length).toBe(1);
  const jsonArray: any[] = res.rows[0].json;
  expect(jsonArray.length).toBeGreaterThan(1);
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof jsonArray[0]['id']).toBe('number');
  expect(typeof jsonArray[0]['name']).toBe('string');
});

test('query of single table for multi column rows results should have proper result structure', async () => {
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
  const res = await execSql(sql);
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
  const res = await execSql(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.id).toBe(1);
  expect(json.name).toBe('Test Drug 1');
});

test('simple table field property names should be as specified by jsonProperty where provided', async () => {
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
  const res = await execSql(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.drugId).toBe(1);
  expect(json.drugName).toBe('Test Drug 1');
});

test('simple table field property names should default according to the provided naming function', async () => {
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
  const res = await execSql(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.idX).toBe(1);
  expect(json.nameX).toBe('Test Drug 1');
});

test('a non-unwrapped child table collection is properly represented in results', async () => {
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
  const res = await execSql(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(new Set(Object.keys(json.compoundsEntered[0]))).toEqual(new Set(['id', 'displayName']));
  expect(new Set(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`)))
    .toEqual(new Set(['2|Test Compound 2', '4|Test Compound 4']));
});

test('an order-by determines ordering in a child table collection', async () => {
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
  const res = await execSql(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json;
  expect(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`))
    .toEqual(['4|Test Compound 4', '2|Test Compound 2']);
});



async function execSql(sql: string, params: any[] = []): Promise<QueryResult>
{
  const pgClient = new PgClient({user: 'drugs', database: 'drugs', password: 'drugs', host: 'localhost'});
  await pgClient.connect();

  try
  {
    return await pgClient.query(sql, []);
  }
  finally
  {
    pgClient.end();
  }
}