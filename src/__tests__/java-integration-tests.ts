import * as os from 'os';
import * as path from 'path';
import {promises as fs} from 'fs'; // for some older node versions (e.g. v10)
import * as child_process from 'child_process';
import * as util from 'util';
import {indentLines, propertyNameDefaultFunction} from '../util';
import {DatabaseMetadata} from '../database-metadata';
import {QuerySqlGenerator} from '../query-sql-generator';
import {ResultTypesSourceGenerator} from '../result-types-source-generator';
import {QueryGroupSpec, QuerySpec} from '../query-specs';
import {generateQueries} from '..';
import {DbHandle, getDbHandle} from './db/db-handle';
const execFile = util.promisify(child_process.execFile);

const dbType = process.env.TEST_DB_TYPE || 'pg';

const dbmdStoredProps = require(`./db/${dbType}/dbmd.json`);
const db: DbHandle = getDbHandle(dbType);
afterAll(async () => {
  await db.end();
});

const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');
const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
const srcGen = new ResultTypesSourceGenerator(dbmd, 'drugs', ccPropNameFn);
const java = { sourceLanguage: 'Java' } as const;

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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug drugRow${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
      )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_ARRAY_ROW') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    `String resJson = ${JSON.stringify(JSON.stringify(queryRes.rows[0].json))};\n` +
    `Drug[] drugs = jsonMapper.readValue(resJson.getBytes(), Drug[].class);\n`
  );
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug drugRow${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
  );
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

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
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
                { expression: 'lower(display_name)', jsonProperty: 'lcName', fieldTypeInGeneratedSource: 'String' }
              ]
            },
            foreignKeyFields: ['entered_by'],
          }
        ]
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const queryRes = await db.query(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );
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

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sjq-tests-'), 'utf8');
  const sqlOutputDir = path.join(tmpDir, 'sql');
  const tsOutputDir = path.join(tmpDir, 'ts');
  const dbmdFile = path.join(tmpDir, 'dbmd.json');

  await fs.mkdir(sqlOutputDir);
  await fs.mkdir(tsOutputDir);
  await fs.writeFile(dbmdFile, JSON.stringify(dbmdStoredProps));

  await generateQueries(queryGroupSpec, dbmdFile, tsOutputDir, sqlOutputDir);

  const sqlFiles = await fs.readdir(sqlOutputDir);
  const tsFiles = await fs.readdir(tsOutputDir);

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

// TODO: Test generateRelationsMetadataSource().

async function compileAndRunTest
  (
    resultTypesSource: string,
    testSource: string
  )
  : Promise<void>
{
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sjq-tests-'), 'utf8');
  await fs.writeFile(path.join(tmpDir, 'pom.xml'), mavenPomContents);
  const srcDir = path.join(tmpDir, 'src/main/java/testpkg');
  await fs.mkdir(srcDir, {recursive: true});
  const resultTypesSourceFileName = 'TestQuery.java';
  const testSourceFileName = 'TestQueryTest.java';
  await fs.writeFile(path.join(srcDir, resultTypesSourceFileName), resultTypesSource);
  await fs.writeFile(path.join(srcDir, testSourceFileName), testSource);

  // noinspection TypeScriptValidateTypes
  await execFile(
    'nix-shell',
    ['-p', 'maven', 'openjdk11', '--run', 'mvn compile exec:java -Dexec.mainClass=testpkg.TestQueryTest'],
    {cwd: tmpDir, env: process.env}
  );
}

function testWithResultTypes(resTypesSrc: string, testSrc: string): Promise<void>
{
  return compileAndRunTest(
    'package testpkg;\n' + resTypesSrc,
    'package testpkg;\n' +
    'import com.fasterxml.jackson.databind.ObjectMapper;\n' +
    'import static com.fasterxml.jackson.databind.DeserializationFeature.*;\n\n' +
    'import static testpkg.TestQuery.*;\n\n' +
    'public class TestQueryTest {\n' +
    '  public static void main(String[] args) throws Exception\n' +
    '  {\n' +
    '    ObjectMapper jsonMapper = new ObjectMapper().configure(FAIL_ON_UNKNOWN_PROPERTIES, true);\n\n' +
    indentLines(testSrc, 4) + '\n' +
    '  }\n' +
    '}\n'
  );
}

/// Maven file contents for compiling java source code for testing.
const mavenPomContents =
`<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
   <modelVersion>4.0.0</modelVersion>
   <groupId>org.sqljson</groupId>
   <artifactId>test-query</artifactId>
   <version>1.0.0</version>
   <name>test query test</name>
   <properties>
      <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
      <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
      <checkerFrameworkVersion>3.1.1</checkerFrameworkVersion>
   </properties>
   <dependencies>
      <dependency>
         <groupId>com.fasterxml.jackson.core</groupId>
         <artifactId>jackson-databind</artifactId>
         <version>2.12.1</version>
      </dependency>
      <dependency>
         <groupId>org.checkerframework</groupId>
         <artifactId>checker-qual</artifactId>
         <version>3.1.1</version>
      </dependency>
   </dependencies>
   <build>
      <plugins>
         <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <version>3.8.1</version>
            <configuration>
               <release>11</release>
            </configuration>
         </plugin>
      </plugins>
   </build>
</project>
`
