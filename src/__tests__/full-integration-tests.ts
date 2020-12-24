import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as child_process from 'child_process';
import * as util from 'util';
import {Client as PgClient, QueryResult} from 'pg';
import {propertyNameDefaultFunction} from '../util';
import {DatabaseMetadata} from '../database-metadata';
import {QuerySqlGenerator} from '../query-sql-generator';
import {ResultTypesGenerator} from '../result-types-generator';
import {ResultTypesSourceGenerator} from '../result-types-source-generator';
import {QuerySpec} from '../query-specs';

const dbConnectInfo = require('./resources/db-connect-info.json');
const dbmdStoredProps = require('./resources/dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');
const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
const resTypesGen = new ResultTypesGenerator(dbmd, 'drugs', ccPropNameFn);
const resTypesSrcGen = new ResultTypesSourceGenerator({sqlResourcePathPrefix: '', typesHeaderFile: null, customPropertyTypeFn: null});
const exec = util.promisify(child_process.exec);

if ( ['1','y','Y','true', 'True'].includes(process.env['SKIP_INTEGRATION_TESTS'] || '0') )
  test.only('skipping integration tests', () => {
    console.warn('skipping integration tests - unset environment variable SKIP_INTEGRATION_TESTS to include');
  });

test('results match generated types for JSON_OBJECT_ROWS query of single table', async () => {
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name']
      }
    };

  const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
  const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const queryRes = await execSql(sql);

  await compile(
    resTypesModuleSrc + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
  );
});

test('results match generated types for JSON_ARRAY_ROW query of single table', async () => {
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_ARRAY_ROW'],
      tableJson: {
        table: 'drug',
        fieldExpressions: ['id', 'name']
      }
    };

  const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
  const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

  const sql = sqlGen.generateSqls(querySpec).get('JSON_ARRAY_ROW') || '';
  const queryRes = await execSql(sql);

  await compile(
    resTypesModuleSrc + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes.rows[0].json, null, 2) + ";"
  );
});

test('simple table field property names specified by jsonProperty attributes', async () => {
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
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
        ]
      },
    };

  const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
  const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const queryRes = await execSql(sql);

  await compile(
    resTypesModuleSrc + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
  );
});


/* TODO: Try customizing foreign keys to child and parents where multiple exist, make sure results actually used the proper fk.
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
*/

async function execSql(sql: string, params: any[] = []): Promise<QueryResult>
{
  const pgClient = new PgClient(dbConnectInfo);
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

async function compile(testSource: string): Promise<void>
{
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sjq-tests-'), 'utf8');
  const srcFileName = 'test.ts';
  await fs.writeFile(path.join(tmpDir, srcFileName), testSource);
  await exec(`tsc --strict ${srcFileName}`, {cwd: tmpDir});
}
