import * as path from 'path';
import {
  makeTempDir,
  makeDir,
  propertyNameDefaultFunction,
  readDirSync,
  readTextFileSync,
  writeTextFile,
  rm
} from '../util/mod';
import { DatabaseMetadata } from '../dbmd';
import { QueryGroupSpec, QuerySpec } from '../query-specs';
import { generateQuerySources, makeQueryResultTypesSource, SourceGenerationOptions } from '../mod';
import { getDbConnection } from './db/db-connection-mysql';
import { spawnSync } from 'child_process';
import { SqlSpecGenerator } from '../sql-generation/sql-spec-generator';
import { SqlSourceGenerator } from '../sql-generation/sql-source-generator';
import { getSqlDialect } from '../sql-generation';

const dbmdPath = path.join(__dirname, 'db', 'mysql', 'dbmd.json');
const dbmdStoredProps = JSON.parse(readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE', dbmd.caseSensitivity);
const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, new Set());

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

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_ARRAY_ROW')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0][0].json, null, 2) + ";"
  );

  dbConn.end();
});

test('table field property names specified by jsonProperty attributes', async () => {
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

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
            referenceName: 'enteredByAnalyst',
            table: 'analyst',
            fieldExpressions: ['id'],
            viaForeignKeyFields: ['entered_by'] // disambiguates among two fks
          }
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('table field properties from inline parent tables', async () => {
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
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('table field properties from an inlined parent and its own inlined parent', async () => {
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
              { field: 'id', jsonProperty: 'compoundId' },
              { field: 'display_name', jsonProperty: 'compoundDisplayName' }
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
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
            table: 'compound',
            childTables: [
              {
                collectionName: 'compoundSharingDrugs',
                table: 'drug',
                fieldExpressions: ['id', 'name']
              }
            ]
          }
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
            table: 'compound',
            childTables: [
              {
                collectionName: 'compoundSharingDrugIds',
                unwrap: true,
                table: 'drug',
                fieldExpressions: ['id']
              }
            ],
          }
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Drug[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
          table: 'compound',
          fieldExpressions: ['id'],
          foreignKeyFields: ['entered_by'] // disambiguates
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Analyst[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('unwrapped child table collection of table field property', async () => {
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

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Analyst[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('unwrapped child table collection of field expression property', async () => {
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
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Analyst[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('unwrapped child table collection of field expression property with lang-specific type', async () => {
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
              { expression: 'lower(display_name)',
                jsonProperty: 'lcName',
                fieldTypeInGeneratedSource: {'TS': 'string', 'Java': 'String'} }
            ],
            foreignKeyFields: ['entered_by'],
          }
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Analyst[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
            table: 'drug',
            parentTables: [
              {
                referenceName: 'registeredBy',
                table: 'analyst',
                fieldExpressions: ['id', 'short_name']
              }
            ]
          }
        ]
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
            table: 'drug',
            parentTables: [
              {
                table: 'analyst',
                fieldExpressions: ['id']
              }
            ]
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
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
            table: 'drug',
            childTables: [
              {
                collectionName: 'advisories',
                unwrap: false,
                table: 'advisory',
                fieldExpressions: ['id', 'advisory_type_id']
              }
            ]
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('unwrapped child collection of unwrapped child collection property', async () => {
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
                fieldExpressions: ['advisory_type_id']
              }
            ]
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  const sql = sqlSrcGen.makeSql(sqlSpec) || '';
  const opts = { sourceLanguage: 'TS' } as const;
  const resTypesModuleSrc = makeQueryResultTypesSource(sqlSpec, 'test query', [], [], opts);

  const dbConn = await getDbConnection();

  const queryRes: [any[], any] = await dbConn.execute(sql);

  await compile(
    resTypesModuleSrc.resultTypesSourceCode + "\n" +
    "const rowVals: Compound[] = " +
    JSON.stringify(queryRes[0].map(r => r.json), null, 2) + ";"
  );

  dbConn.end();
});

test('generateQueries() produces expected output files', async () => {
  const queryGroupSpec: QueryGroupSpec =
  {
    defaultSchema: 'drugs',
    generateUnqualifiedNamesForSchemas: ['drugs'],
    querySpecs: [
      {
        queryName: 'test query 1',
        resultRepresentations: ['JSON_OBJECT_ROWS', 'JSON_ARRAY_ROW'],
        tableJson: {
          table: 'drug',
          fieldExpressions: ['id', 'name']
        }
      },
      {
        queryName: 'test query 2',
        resultRepresentations: ['JSON_OBJECT_ROWS'],
        tableJson: {
          table: 'drug',
          fieldExpressions: ['id', 'name']
        }
      }
    ]
  };

  const tmpDir = await makeTempDir('sjq-tests-');
  const sqlOutputDir = path.join(tmpDir, 'sql');
  const resultTypesOutputDir = path.join(tmpDir, 'ts');
  const dbmdFile = path.join(tmpDir, 'dbmd.json');

  await makeDir(sqlOutputDir);
  await makeDir(resultTypesOutputDir);
  await writeTextFile(dbmdFile, JSON.stringify(dbmdStoredProps));

  const opts: SourceGenerationOptions = { sourceLanguage: 'TS', resultTypesOutputDir, sqlOutputDir } as const;
  await generateQuerySources(queryGroupSpec, dbmdFile, opts);

  const sqlFiles = Array.from(readDirSync(sqlOutputDir)).map(f => f.name);
  const tsFiles = Array.from(readDirSync(resultTypesOutputDir)).map(f => f.name);

  expect(new Set(sqlFiles)).toEqual(new Set([
    'test-query-1(json array row).sql',
    'test-query-1(json object rows).sql',
    'test-query-2.sql'
  ]));

  expect(new Set(tsFiles)).toEqual(new Set([
    'test-query-1.ts',
    'test-query-2.ts'
  ]));
});


async function compile(testSource: string): Promise<void>
{
  const tmpDir = await makeTempDir('sjq-tests-');
  const srcFileName = 'test.ts';
  await writeTextFile(path.join(tmpDir, srcFileName), testSource);
  const tscPath = `${path.dirname(path.dirname((__dirname)))}/node_modules/typescript/bin/tsc`;
  const cp = spawnSync(
    tscPath,
    ['--strict', srcFileName],
    {cwd: tmpDir, encoding: 'utf8'}
  );

  expect(cp.error).toBeUndefined();
  expect(cp.stderr == null || cp.stderr === '' || cp.stderr.match(/^Debugger attached.\n..*to disconnect\.\.\./));
  await rm(tmpDir, { recursive: true, force: true });
}
