import * as path from 'path';
import {Client} from 'pg';
import {getDbClient} from './db/db-client-pg';
import {propertyNameDefaultFunction} from '../util/mod';
import {readTextFileSync} from '../util/files';
import {QuerySpec} from '../mod';
import {DatabaseMetadata} from '../dbmd';
import {SqlSpecGenerator} from '../sql-gen/sql-spec-generator';
import {SqlSourceGenerator} from '../sql-gen/sql-source-generator';
import {getSqlDialect} from '../sql-gen';

const dbmdPath = path.join(__dirname, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE', dbmd.caseSensitivity);

test('query of single table for json object rows results', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(5);

  const firstJson = res.rows[0].json as any;
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof firstJson['id']).toEqual('number');
  expect(typeof firstJson['name']).toEqual('string');
  dbClient.end();
});

test('query of single table for json array row results', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_ARRAY_ROW'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_ARRAY_ROW')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const jsonArray: any[] = res.rows[0].json as any[];
  expect(jsonArray.length).toBe(5);
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof jsonArray[0]['id']).toEqual('number');
  expect(typeof jsonArray[0]['name']).toEqual('string');
  dbClient.end();
});

test('query of single table for multi column rows results', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['MULTI_COLUMN_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
      }
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('MULTI_COLUMN_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBeGreaterThan(1);
  const firstRow = res.rows[0];
  // id and name are not-null fields, so typeof the values should be number and string
  expect(typeof firstRow['id']).toEqual('number');
  expect(typeof firstRow['name']).toEqual('string');
  dbClient.end();
});

test('record condition properly restricts results for top level table', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        recordCondition: {sql: '$$.id = 1'}
      },
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.id).toBe(1);
  expect(json.name).toEqual('Test Drug 1');
  dbClient.end();
});

test('custom alias is usable in record condition', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        alias: 'customAlias',
        fieldExpressions: ['id', 'name'],
        recordCondition: {sql: 'customAlias.id = 1'}
      },
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.id).toBe(1);
  expect(json.name).toEqual('Test Drug 1');
  dbClient.end();
});

test('table field property names specified by jsonProperty', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.drugId).toBe(1);
  expect(json.drugName).toEqual('Test Drug 1');
  dbClient.end();
});

test('table field property names default according to the provided naming function', async () => {
  const appendX = (fieldName: string) => fieldName + "X";
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', appendX);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name'],
        recordCondition: {sql: '$$.id = 1'}
      },
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.idX).toBe(1);
  expect(json.nameX).toEqual('Test Drug 1');
  dbClient.end();
});

test('non-unwrapped child table collection', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(Object.keys(json.compoundsEntered[0]))).toEqual(new Set(['id', 'displayName']));
  expect(new Set(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`))).toEqual(
    new Set(['2|Test Compound 2', '4|Test Compound 4'])
  );
  dbClient.end();
});

test('unwrapped child table collection of table field property', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(json.compoundsEntered)).toEqual(new Set([2,4]));
  dbClient.end();
});

test('unwrapped child table collection of field exression property', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(json.compoundsEntered)).toEqual(new Set(['test compound 2', 'test compound 4']));
  dbClient.end();
});

test('unwrapped child table collection of parent reference property', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.drugAnalysts.length).toBe(1);
  const drugAnalyst: any = json.drugAnalysts[0];
  expect(drugAnalyst.id).toBe(1);
  expect(drugAnalyst.shortName).toEqual('jdoe');
  dbClient.end();
});

test('unwrapped child table collection of inlined parent property', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.drugRegisteringAnalystIds).toEqual([1]);
  dbClient.end();
});

test('unwrapped child collection of child collection property', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.drugAdvisories.length).toBe(1);
  const advisories = json.drugAdvisories[0];
  expect(advisories.length).toBe(3);
  expect(new Set(Object.keys(advisories[0]))).toEqual(new Set(['id', 'advisoryTypeId']));
  expect(new Set(advisories.map((a: any) => `${a.id}|${a.advisoryTypeId}`))).toEqual(
    new Set(['101|1',  '102|2', '123|3'])
  );
  dbClient.end();
});

test('unwrapped child collection of unwrapped child collection property', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.drugAdvisoryTypeIds.length).toBe(1);
  const advisoryTypeIds = json.drugAdvisoryTypeIds[0];
  expect(new Set(advisoryTypeIds)).toEqual(new Set([1,2,3]));
  dbClient.end();
});

test('unwrapped child collection with element type containing more than one property should cause error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
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

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(
    /cannot have multiple field expressions/i
  );
});

test('order-by specification determines ordering in a child table collection (desc)', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            table: 'compound',
            alias: 'cmp',
            fieldExpressions: ['id', 'display_name'],
            foreignKeyFields: ['entered_by'],
            orderBy: 'cmp.id desc'
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`)).toEqual(
    ['4|Test Compound 4', '2|Test Compound 2']
  );
  dbClient.end();
});

test('order-by specification determines ordering in a child table collection (asc)', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      tableJson: {
        table: 'analyst',
        childTables: [
          {
            collectionName: 'compoundsEntered',
            table: 'compound',
            alias: 'cmp',
            fieldExpressions: ['id', 'display_name'],
            foreignKeyFields: ['entered_by'],
            orderBy: 'cmp.id'
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(json.compoundsEntered.map((ce: any) => `${ce.id}|${ce.displayName}`)).toEqual(
    ['2|Test Compound 2', '4|Test Compound 4']
  );
  dbClient.end();
});



test('referenced parent table', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(Object.keys(json.enteredByAnalyst))).toEqual(new Set(['id', 'shortName']));
  expect(json.enteredByAnalyst.id).toBe(2);
  expect(json.enteredByAnalyst.shortName).toEqual('sch');
  dbClient.end();
});

test('table field properties from inline parent tables', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(Object.keys(json))).toEqual(new Set(['id', 'analystId', 'analystShortName']));
  expect(json.id).toBe(1);
  expect(json.analystId).toBe(2);
  expect(json.analystShortName).toEqual('sch');
  dbClient.end();
});

test('table field properties from an inlined parent and its own inlined parent', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(Object.keys(json))).toEqual(new Set([
    'id', 'name', // from top-level table
    'compoundId', 'compoundDisplayName', // from inlined compound parent
    'compoundApprovedBy' // from inlined analyst parent of compound
  ]));
  expect(json.id).toBe(1);
  expect(json.name).toEqual('Test Drug 1');
  expect(json.compoundId).toBe(1);
  expect(json.compoundDisplayName).toEqual('Test Compound 1');
  expect(json.compoundApprovedBy).toEqual('jdoe');
  dbClient.end();
});

test('referenced parent property from an inlined parent', async () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sql = sqlSrcGen.makeSql(sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!) || '';
  const dbClient: Client = await getDbClient();
  const res = await dbClient.query(sql);
  expect(res.rows.length).toBe(1);
  const json = res.rows[0].json as any;
  expect(new Set(Object.keys(json))).toEqual(new Set([
    'id', 'name', // from top-level "drug" table
    'enteredByAnalyst' // from analyst parent of inlined parent table "compound"
  ]));
  expect(json.id).toBe(1);
  expect(json.name).toEqual('Test Drug 1');
  expect(new Set(Object.keys(json.enteredByAnalyst))).toEqual(new Set(['id', 'shortName']));
  expect(json.enteredByAnalyst.id).toBe(2);
  expect(json.enteredByAnalyst.shortName).toEqual('sch');
  dbClient.end();
});
