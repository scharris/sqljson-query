import * as path from 'https://deno.land/std@0.97.0/path/mod.ts';
import {Client} from "https://deno.land/x/postgres/mod.ts";
import {assertEquals, assertThrows, assert} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {propertyNameDefaultFunction} from '../util/mod.ts';
import {QuerySpec} from '../mod.ts';
import {DatabaseMetadata} from '../database-metadata.ts';
import {QuerySqlGenerator} from '../query-sql-generator.ts';
import {getDbClient} from './db/db-handle.ts';

const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
const dbmdPath = path.join(scriptDir, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(Deno.readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');


Deno.test('query of single table for json object rows results', async () => {
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
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 5);

  const firstJson = res.rows[0].json as any;
  // id and name are not-null fields, so typeof the values should be number and string
  assertEquals(typeof firstJson['id'], 'number');
  assertEquals(typeof firstJson['name'], 'string');
  dbClient.end();
});

Deno.test('query of single table for json array row results', async () => {
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
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const jsonArray: any[] = res.rows[0].json as any[];
  assertEquals(jsonArray.length, 5);
  // id and name are not-null fields, so typeof the values should be number and string
  assertEquals(typeof jsonArray[0]['id'], 'number');
  assertEquals(typeof jsonArray[0]['name'], 'string');
  dbClient.end();
});

Deno.test('query of single table for multi column rows results', async () => {
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
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assert(res.rows.length > 1);
  const firstRow = res.rows[0];
  // id and name are not-null fields, so typeof the values should be number and string
  assertEquals(typeof firstRow['id'], 'number');
  assertEquals(typeof firstRow['name'], 'string');
  dbClient.end();
});

Deno.test('record condition properly restricts results for top level table', async () => {
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
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.id, 1);
  assertEquals(json.name, 'Test Drug 1');
  dbClient.end();
});

Deno.test('table field property names specified by jsonProperty', async () => {
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
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.drugId, 1);
  assertEquals(json.drugName, 'Test Drug 1');
  dbClient.end();
});

Deno.test('table field property names default according to the provided naming function', async () => {
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
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.idX, 1);
  assertEquals(json.nameX, 'Test Drug 1');
  dbClient.end();
});

Deno.test('non-unwrapped child table collection', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            table: 'compound',
            fieldExpressions: ['id', 'display_name'],
            foreignKeyFields: ['entered_by'],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(new Set(Object.keys(json.compoundsEntered[0])), new Set(['id', 'displayName']));
  assertEquals(
    new Set(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`)),
    new Set(['2|Test Compound 2', '4|Test Compound 4'])
  );
  dbClient.end();
});

Deno.test('unwrapped child table collection of table field property', async () => {
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
            table: 'compound',
            fieldExpressions: ['id'],
            foreignKeyFields: ['entered_by'],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(
    new Set(json.compoundsEntered),
    new Set([2,4])
  );
  dbClient.end();
});

Deno.test('unwrapped child table collection of field exression property', async () => {
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
            table: 'compound',
            fieldExpressions: [
              { expression: 'lower(display_name)', jsonProperty: 'lcName', fieldTypeInGeneratedSource: 'string' }
            ],
            foreignKeyFields: ['entered_by'],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(
    new Set(json.compoundsEntered),
    new Set(['test compound 2', 'test compound 4'])
  );
  dbClient.end();
});

Deno.test('unwrapped child table collection of parent reference property', async () => {
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
            table: 'drug',
            parentTables: [
              {
                referenceName: 'registeredBy',
                table: 'analyst',
                fieldExpressions: ['id', 'short_name'],
              }
            ],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.drugAnalysts.length, 1);
  const drugAnalyst: any = json.drugAnalysts[0];
  assertEquals(drugAnalyst.id, 1);
  assertEquals(drugAnalyst.shortName, 'jdoe');
  dbClient.end();
});

Deno.test('unwrapped child table collection of inlined parent property', async () => {
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
            table: 'drug',
            parentTables: [
              {
                table: 'analyst',
                fieldExpressions: ['id']
              }
            ],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.drugRegisteringAnalystIds, [1]);
  dbClient.end();
});

Deno.test('unwrapped child collection of child collection property', async () => {
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
            table: 'drug',
            childTables: [
              {
                collectionName: 'advisories',
                unwrap: false,
                table: 'advisory',
                fieldExpressions: ['id', 'advisory_type_id']
              }
            ],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.drugAdvisories.length, 1);
  const advisories = json.drugAdvisories[0];
  assertEquals(advisories.length, 3);
  assertEquals(new Set(Object.keys(advisories[0])), new Set(['id', 'advisoryTypeId']));
  assertEquals(
    new Set(advisories.map((a: any) => `${a.id}|${a.advisoryTypeId}`)),
    new Set(['101|1',  '102|2', '123|3'])
  );
  dbClient.end();
});

Deno.test('unwrapped child collection of unwrapped child collection property', async () => {
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
            table: 'drug',
            childTables: [
              {
                collectionName: 'advisories',
                unwrap: true,
                table: 'advisory',
                fieldExpressions: ['advisory_type_id'],
              }
            ],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(json.drugAdvisoryTypeIds.length, 1);
  const advisoryTypeIds = json.drugAdvisoryTypeIds[0];
  assertEquals(new Set(advisoryTypeIds), new Set([1,2,3]));
  dbClient.end();
});

Deno.test('unwrapped child collection with element type containing more than one property should cause error', () => {
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
            table: 'drug',
            fieldExpressions: ['id', 'name']
          }
        ]
      }
    };

  assertThrows(() => sqlGen.generateSqls(querySpec), Error, 'incompatible with multiple field expressions');
});

Deno.test('order-by specification determines ordering in a child table collection', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            table: 'compound',
            fieldExpressions: ['id', 'display_name'],
            foreignKeyFields: ['entered_by'],
            orderBy: '$$.id desc'
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(
    json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`),
    ['4|Test Compound 4', '2|Test Compound 2']
  );
  dbClient.end();
});

Deno.test('referenced parent table', async () => {
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
            table: 'analyst',
            fieldExpressions: ['id', 'short_name'],
            viaForeignKeyFields: ['entered_by']
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(new Set(Object.keys(json.enteredByAnalyst)), new Set(['id', 'shortName']));
  assertEquals(json.enteredByAnalyst.id, 2);
  assertEquals(json.enteredByAnalyst.shortName, 'sch');
  dbClient.end();
});

Deno.test('table field properties from inline parent tables', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'compound',
        fieldExpressions: ['id'],
        parentTables: [
          {
            table: 'analyst',
            fieldExpressions: [
              { field: 'id', jsonProperty: 'analystId' },
              { field: 'short_name', jsonProperty: 'analystShortName' }
            ],
            viaForeignKeyFields: ['entered_by']
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(new Set(Object.keys(json)), new Set(['id', 'analystId', 'analystShortName']));
  assertEquals(json.id, 1);
  assertEquals(json.analystId, 2);
  assertEquals(json.analystShortName, 'sch');
  dbClient.end();
});

Deno.test('table field properties from an inlined parent and its own inlined parent', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        parentTables: [
          {
            table: 'compound',
            fieldExpressions: [
              {field: 'id', jsonProperty: 'compoundId'},
              {field: 'display_name', jsonProperty: 'compoundDisplayName'}
            ],
            parentTables: [
              {
                table: 'analyst',
                fieldExpressions: [
                  { field: 'short_name', jsonProperty: 'compoundApprovedBy' }
                ],
                viaForeignKeyFields: ['approved_by']
              }
            ],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(new Set(Object.keys(json)), new Set([
    'id', 'name', // from top-level table
    'compoundId', 'compoundDisplayName', // from inlined compound parent
    'compoundApprovedBy' // from inlined analyst parent of compound
  ]));
  assertEquals(json.id, 1);
  assertEquals(json.name, 'Test Drug 1');
  assertEquals(json.compoundId, 1);
  assertEquals(json.compoundDisplayName, 'Test Compound 1');
  assertEquals(json.compoundApprovedBy, 'jdoe');
  dbClient.end();
});

Deno.test('referenced parent property from an inlined parent', async () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        parentTables: [
          {
            table: 'compound',
            parentTables: [
              {
                referenceName: 'enteredByAnalyst',
                table: 'analyst',
                fieldExpressions: ['id', 'short_name'],
                viaForeignKeyFields: ['entered_by']
              },
            ],
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.queryObject(sql);
  assertEquals(res.rows.length, 1);
  const json = res.rows[0].json as any;
  assertEquals(new Set(Object.keys(json)), new Set([
    'id', 'name', // from top-level "drug" table
    'enteredByAnalyst' // from analyst parent of inlined parent table "compound"
  ]));
  assertEquals(json.id, 1);
  assertEquals(json.name, 'Test Drug 1');
  assertEquals(new Set(Object.keys(json.enteredByAnalyst)), new Set(['id', 'shortName']));
  assertEquals(json.enteredByAnalyst.id, 2);
  assertEquals(json.enteredByAnalyst.shortName, 'sch');
  dbClient.end();
});
