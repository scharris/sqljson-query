import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as child_process from 'child_process';
import * as util from 'util';
import {Pool} from 'pg';
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

const dbPool = new Pool(dbConnectInfo);

afterAll(async () => {
  await dbPool.end();
});

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
  const queryRes = await dbPool.query(sql);

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
  const queryRes = await dbPool.query(sql);

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
  const queryRes = await dbPool.query(sql);

  await compile(
    resTypesModuleSrc + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
  );
});

test('parent reference', async () => {
  const querySpec: QuerySpec =
    {
      queryName: 'test query',
      resultRepresentations: ['JSON_OBJECT_ROWS'],
      tableJson: {
        table: 'compound',
        fieldExpressions: ['id'],
        parentTables: [
          {
            referenceName: 'enteredByAnalylst',
            tableJson: {
              table: 'analyst',
              fieldExpressions: ['id'],
            },
            viaForeignKeyFields: ['entered_by'] // disambiguates among two fks
          }
        ]
      }
    };

  const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
  const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const queryRes = await dbPool.query(sql);

  await compile(
    resTypesModuleSrc + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
  );
});

test('simple table field properties from inline parent tables', async () => {
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
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Compound[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('simple field properties from an inlined parent and its own inlined parent', async () => {
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
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Drug[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('referenced parent property from an inlined parent', async () => {
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
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Drug[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('child collection property from an inlined parent', async () => {
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
              childTables: [
                {
                  collectionName: 'compoundSharingDrugs',
                  tableJson: {
                    table: 'drug',
                    fieldExpressions: ['id', 'name']
                  }
                }
              ]
            }
          }
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Drug[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('unwrapped child collection property from an inlined parent', async () => {
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
              childTables: [
                {
                  collectionName: 'compoundSharingDrugIds',
                  unwrap: true,
                  tableJson: {
                    table: 'drug',
                    fieldExpressions: ['id']
                  }
                }
              ]
            }
          }
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Drug[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('child collection', async () => {
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

  const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
  const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
  const queryRes = await dbPool.query(sql);

  await compile(
    resTypesModuleSrc + "\n" +
    "const rowVals: Analyst[] = " +
    JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
  );
});

test('unwrapped child table collection of simple table field property', async () => {
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

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Analyst[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('unwrapped child table collection of field exression property', async () => {
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
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Analyst[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('unwrapped child table collection of parent reference property', async () => {
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
        ]
      }
    };

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Compound[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('unwrapped child table collection of inlined parent property', async () => {
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

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Compound[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
});

test('unwrapped child collection of child collection property', async () => {
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

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Compound[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
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

    const resTypes = resTypesGen.generateResultTypes(querySpec.tableJson, 'test query');
    const resTypesModuleSrc = await resTypesSrcGen.getModuleSource(querySpec, resTypes, []);

    const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';
    const queryRes = await dbPool.query(sql);

    await compile(
      resTypesModuleSrc + "\n" +
      "const rowVals: Compound[] = " +
      JSON.stringify(queryRes.rows.map(r => r.json), null, 2) + ";"
    );
  });

async function compile(testSource: string): Promise<void>
{
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sjq-tests-'), 'utf8');
  const srcFileName = 'test.ts';
  await fs.writeFile(path.join(tmpDir, srcFileName), testSource);
  await exec(`tsc --strict ${srcFileName}`, {cwd: tmpDir});
}
