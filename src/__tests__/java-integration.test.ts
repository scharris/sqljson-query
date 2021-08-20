import * as path from 'https://deno.land/std@0.97.0/path/mod.ts';
import {Client} from "https://deno.land/x/postgres/mod.ts";
import {assertEquals, assert} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {indentLines, propertyNameDefaultFunction} from '../util/mod.ts';
import {DatabaseMetadata} from '../database-metadata.ts';
import {QuerySqlGenerator} from '../query-sql-generator.ts';
import {ResultTypesSourceGenerator} from '../result-types-source-generator.ts';
import {QueryGroupSpec, QuerySpec} from '../query-specs.ts';
import {generateQuerySources} from '../mod.ts';
import {getDbClient} from './db/db-handle.ts';

const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
const dbmdPath = path.join(scriptDir, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(Deno.readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');
const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(), ccPropNameFn, 2);
const srcGen = new ResultTypesSourceGenerator(dbmd, 'drugs', ccPropNameFn);
const java = { sourceLanguage: 'Java' } as const;

Deno.test('results match generated types for JSON_OBJECT_ROWS query of single table', async () => {
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

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug drugRow${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
      )).join('\n')
  );

  dbClient.end();
});

Deno.test('results match generated types for JSON_ARRAY_ROW query of single table', async () => {
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

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    `String resJson = ${JSON.stringify(JSON.stringify(queryRes.rows[0].json))};\n` +
    `Drug[] drugs = jsonMapper.readValue(resJson.getBytes(), Drug[].class);\n`
  );

  dbClient.end();
});

Deno.test('table field property names specified by jsonProperty attributes', async () => {
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

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug drugRow${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('parent reference', async () => {
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
            table: 'analyst',
            fieldExpressions: ['id'],
            viaForeignKeyFields: ['entered_by'] // disambiguates among two fks
          }
        ]
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('table field properties from inline parent tables', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('table field properties from an inlined parent and its own inlined parent', async () => {
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
            ]
          }
        ]
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('referenced parent property from an inlined parent', async () => {
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
            ]
          }
        ]
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('child collection property from an inlined parent', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child collection property from an inlined parent', async () => {
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
            ]
          }
        ]
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Drug row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Drug.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('child collection', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child table collection of table field property', async () => {
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

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child table collection of field exression property', async () => {
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
              { expression: 'lower(display_name)', jsonProperty: 'lcName', fieldTypeInGeneratedSource: 'String' }
            ],
            foreignKeyFields: ['entered_by'],
          }
        ]
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child table collection of field expression property with lang-specific type', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Analyst row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Analyst.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child table collection of parent reference property', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child table collection of inlined parent property', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('unwrapped child collection of child collection property', async () => {
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

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
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
                fieldExpressions: ['advisory_type_id']
              }
            ]
          }
        ],
        recordCondition: {sql: '$$.id = 1'}
      }
    };

  const sql = sqlGen.generateSqls(querySpec).get('JSON_OBJECT_ROWS') || '';

  const resTypesSrc = await srcGen.makeQueryResultTypesSource(querySpec, [], 'TestQuery.java', java);

  const dbClient: Client = await getDbClient();

  const queryRes = await dbClient.queryObject(sql);

  await testWithResultTypes(
    resTypesSrc,
    queryRes.rows.map((resRow, ix) => (
      `String row${ix+1}Json = ${JSON.stringify(JSON.stringify(resRow.json))};\n` +
      `Compound row${ix+1} = jsonMapper.readValue(row${ix+1}Json.getBytes(), Compound.class);\n`
    )).join('\n')
  );

  dbClient.end();
});

Deno.test('generateQueries() produces expected output files', async () => {
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

  const tmpDir = await Deno.makeTempDir({ prefix: 'sjq-tests-' });
  const sqlOutputDir = path.join(tmpDir, 'sql');
  const javaOutputDir = path.join(tmpDir, 'java');
  const dbmdFile = path.join(tmpDir, 'dbmd.json');

  await Deno.mkdir(sqlOutputDir);
  await Deno.mkdir(javaOutputDir);
  await Deno.writeTextFile(dbmdFile, JSON.stringify(dbmdStoredProps));

  await generateQuerySources(queryGroupSpec, dbmdFile, javaOutputDir, sqlOutputDir);

  const sqlFiles = Array.from(Deno.readDirSync(sqlOutputDir)).map(f => f.name);
  const javaFiles = Array.from(Deno.readDirSync(javaOutputDir)).map(f => f.name);

  assertEquals(new Set(sqlFiles), new Set([
    'test-query-1(json array row).sql',
    'test-query-1(json object rows).sql',
    'test-query-2.sql'
  ]));

  // TODO: These should be java files.
  assertEquals(new Set(javaFiles), new Set([
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
  const tmpDir = await Deno.makeTempDir({ prefix: 'sjq-tests-' });
  await Deno.writeTextFile(path.join(tmpDir, 'pom.xml'), mavenPomContents);
  const srcDir = path.join(tmpDir, 'src/main/java/testpkg');
  await Deno.mkdir(srcDir, {recursive: true});
  const resultTypesSourceFileName = 'TestQuery.java';
  const testSourceFileName = 'TestQueryTest.java';
  await Deno.writeTextFile(path.join(srcDir, resultTypesSourceFileName), resultTypesSource);
  await Deno.writeTextFile(path.join(srcDir, testSourceFileName), testSource);

  const compileProcess = Deno.run({
    cmd: ['mvn', 'compile', 'exec:java', '-Dexec.mainClass=testpkg.TestQueryTest'],
    cwd: tmpDir,
    env: Deno.env.toObject()
  });
  const compileStatus = await compileProcess.status();
  assert(compileStatus.success);
  compileProcess.close();
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
