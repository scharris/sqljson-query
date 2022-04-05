import * as path from 'path';
import { promises as fs } from 'fs';
import {
  propertyNameDefaultFunction,
  requireDirExists,
  requireFileExists,
  writeTextFile,
  cwd,
  mapValues,
  firstValue,
  parseArgs,
  parseBoolOption,
  replaceAll
} from './util/mod';
import { readDatabaseMetadata } from './dbmd';
import { getQueryParamNames, QueryGroupSpec, ResultRepr, SpecError } from './query-specs';
import { SourceGenerationOptions } from './source-generation-options';
import { makeQueryResultTypesSource, QueryReprSqlPath } from './result-type-generation';
import { SqlSourceGenerator } from './sql-generation/sql-source-generator';
import { SqlSpecGenerator } from './sql-generation/sql-spec-generator';
import { SqlSpec } from './sql-generation/sql-specs';
import { getSqlDialect } from './sql-generation';
import { makeQueryPropertiesMetadata } from './result-metadata-generation/query-properties-metadata-generator';

export * from './source-generation-options';
export * from './query-specs';
export * from './result-type-generation';
export * from './dbmd/relations-md-source-generator';

export interface QueryGenerationOptions {
  dbmdFile: string;
  sqlOutputDir: string;
  sqlSpecOutputDir?: string;
  queryPropsMdOutputDir?: string;
  tsOutputDir?: string | null;
  javaBaseOutputDir?: string | null;
  javaPackage?: string | null;
  javaEmitRecords?: boolean | null;
  tsTypesHeaderFile?: string;
  javaHeaderFile?: string | null;
  sqlResourcePath?: string;
}

export async function generateQueriesWithArgvOptions
  (
    queryGroupSpec: QueryGroupSpec,
    args: string[],
  )
{
  const requiredOptions = [
    'dbmd', // database metadata json file path
    'sqlDir'
  ];
  const optionalOptions = [
    'sqlSpecDir',
    'propsMdDir',
    'sqlResourcePath',
    'tsQueriesDir', 'tsTypesHeader',
    'javaBaseDir', 'javaQueriesPkg', 'javaTypesHeader', 'javaEmitRecords'
  ];

  const parsedArgs = parseArgs(args, requiredOptions, optionalOptions, 0);
  if ( typeof parsedArgs === 'string' ) // arg parsing error
    throw new Error(parsedArgs);

  const opts = {
    dbmdFile: parsedArgs['dbmd'],
    sqlOutputDir: parsedArgs['sqlDir'],
    sqlSpecOutputDir: parsedArgs['sqlSpecDir'],
    queryPropsMdOutputDir: parsedArgs['propsMdDir'],
    tsOutputDir: parsedArgs['tsQueriesDir'],
    javaBaseOutputDir: parsedArgs['javaBaseDir'],
    javaPackage: parsedArgs['javaQueriesPkg'] ?? '',
    javaEmitRecords: parseBoolOption(parsedArgs['javaEmitRecords'] ?? 'true', 'javaEmitRecords'),
    tsTypesHeaderFile: parsedArgs['tsTypesHeader'],
    javaTypesHeaderFile: parsedArgs['javaTypesHeader'],
    sqlResourcePath: parsedArgs['sqlResourcePath'],
  };

  generateQueriesWithOptions(queryGroupSpec, opts);
}


export async function generateQueriesWithOptions
  (
    queryGroupSpec: QueryGroupSpec,
    opts: QueryGenerationOptions
  )
{
  // Generate SQL source files if specified.

  const javaOutputDir =
    opts.javaBaseOutputDir
      ? `${opts.javaBaseOutputDir}/${replaceAll(opts.javaPackage ?? '', '.','/')}`
      : null;

  if ( opts.sqlOutputDir == null )
    throw new Error('SQL output directory is required.');
  if ( opts.tsOutputDir == null && javaOutputDir == null )
    throw new Error('An output directory argument for result types is required.');

  await fs.mkdir(opts.sqlOutputDir, {recursive: true});
  if (opts.sqlSpecOutputDir)
    await fs.mkdir(opts.sqlSpecOutputDir, {recursive: true});
  if (opts.queryPropsMdOutputDir)
    await fs.mkdir(opts.queryPropsMdOutputDir, {recursive: true});

  // Generate TS query/result-type source files if specified.
  if (opts.tsOutputDir)
  {
    await fs.mkdir(opts.tsOutputDir, {recursive: true});

    console.log(`Writing TS source files to ${opts.tsOutputDir}.`);

    await generateQuerySources(
      queryGroupSpec,
      opts.dbmdFile,
      {
        sourceLanguage: 'TS',
        resultTypesOutputDir: opts.tsOutputDir,
        sqlSpecOutputDir: opts.sqlSpecOutputDir,
        queryPropertiesOutputDir: opts.queryPropsMdOutputDir,
        sqlOutputDir: opts.sqlOutputDir,
        typesHeaderFile: opts.tsTypesHeaderFile,
        sqlResourcePathPrefix: opts.sqlResourcePath,
      }
    );
  }

  // Generate Java sources if specified.
  if (javaOutputDir)
  {
    await fs.mkdir(javaOutputDir, {recursive: true});

    console.log(`Writing Java query source files to ${javaOutputDir}.`);

    await generateQuerySources(
      queryGroupSpec,
      opts.dbmdFile,
      {
        sourceLanguage: 'Java',
        resultTypesOutputDir: javaOutputDir,
        sqlSpecOutputDir: opts.sqlSpecOutputDir,
        queryPropertiesOutputDir: opts.queryPropsMdOutputDir,
        sqlOutputDir: opts.sqlOutputDir,
        javaOptions: {
          javaPackage: opts.javaPackage ?? '',
          emitRecords: opts.javaEmitRecords ?? true
        },
        typesHeaderFile: opts.tsTypesHeaderFile,
        sqlResourcePathPrefix: opts.sqlResourcePath,
      }
    );
  }
}

export async function generateQuerySources
  (
    querySpecs: QueryGroupSpec | string, // string should be a path to a json file or js module file
    dbmdFile: string,
    opts: SourceGenerationOptions
  )
  : Promise<void>
{
  try
  {
    await checkFilesAndDirectoriesExist(dbmdFile, opts);

    const dbmd = await readDatabaseMetadata(dbmdFile);
    const queryGroupSpec = await readQueryGroupSpec(querySpecs);
    const defaultSchema = queryGroupSpec.defaultSchema;
    const unqualNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas);
    const propNameFn = propertyNameDefaultFunction(queryGroupSpec.propertyNameDefault, dbmd.caseSensitivity);

    // generators
    const sqlSpecGen = new SqlSpecGenerator(dbmd, defaultSchema, propNameFn);
    const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, unqualNameSchemas);

    for (const query of queryGroupSpec.querySpecs)
    {
      const sqlSpecsByRepr = sqlSpecGen.generateSqlSpecs(query);
      const firstSqlSpec = firstValue(sqlSpecsByRepr);

      if (opts.sqlSpecOutputDir)
        await writeSqlSpecs(sqlSpecsByRepr, query.queryName, opts.sqlSpecOutputDir);

      if (opts.queryPropertiesOutputDir)
        await writePropertiesMetadata(firstSqlSpec, query.queryName, opts.queryPropertiesOutputDir);

      const sqlPaths =
        await writeSqls(sqlSpecsByRepr, query.queryName, sqlSrcGen, opts.sqlOutputDir);

      if (query.generateResultTypes ?? true)
        await writeResultTypes(firstSqlSpec, query.queryName, sqlPaths, getQueryParamNames(query), opts);
    }
  }
  catch (e)
  {
    if (e instanceof SpecError) throw makeSpecLocationError(e);
    else throw e;
  }
}

async function readQueryGroupSpec(querySpecs: QueryGroupSpec | string): Promise<QueryGroupSpec>
{
  if (typeof querySpecs === 'string')
  {
    await requireFileExists(querySpecs, 'Query specifications file not found.');
    return await readQueriesSpecFile(querySpecs);
  }
  else
    return querySpecs;
}

async function readQueriesSpecFile(filePath: string): Promise<QueryGroupSpec>
{
  const fileExt = path.extname(filePath).toLowerCase();
  if (fileExt === '.ts' || fileExt === '.js') // .ts only supported when running via ts-node or deno.
  {
    const modulePath = filePath.startsWith('./') ? cwd() + filePath.substring(1) : filePath;
    const mod = await import(modulePath);
    return mod.default;
  }
  else
    throw new Error('Unrecognized file extension for query specs file.');
}

async function writeSqlSpecs
  (
    resultReprToSqlSpecMap: Map<ResultRepr,SqlSpec>,
    queryName: string,
    outputDir: string
  )
  : Promise<void>
{
  const multReprs = resultReprToSqlSpecMap.size > 1;

  for (const [resultRepr, sqlSpec] of resultReprToSqlSpecMap.entries())
  {
    const modQueryName = queryName.replace(/ /g, '-').toLowerCase();
    const reprDescn = resultRepr.toLowerCase().replace(/_/g, ' ');
    const sqlSpecFileName = multReprs ? `${modQueryName}(${reprDescn}).json` : `${modQueryName}.json`;
    const sqlSpecPath = path.join(outputDir, sqlSpecFileName);

    await writeTextFile(sqlSpecPath, JSON.stringify(sqlSpec, null, 2) + "\n", { avoidWritingSameContents: true });
  }
}

async function writePropertiesMetadata
  (
    sqlSpec: SqlSpec,
    queryName: string,
    outputDir: string
  )
  : Promise<void>
{
  const propsMd = makeQueryPropertiesMetadata(queryName, sqlSpec);
  const fileName = queryName.replace(/ /g, '-').toLowerCase() + '-properties.json';
  const propsMdPath = path.join(outputDir, fileName);

  await writeTextFile(propsMdPath, JSON.stringify(propsMd, null, 2), { avoidWritingSameContents: true });
}

async function writeSqls
  (
    sqlSpecs: Map<ResultRepr,SqlSpec>,
    queryName: string,
    sqlSrcGen: SqlSourceGenerator,
    outputDir: string
  )
  : Promise<QueryReprSqlPath[]>
{
  const resultReprToSqlMap = mapValues(sqlSpecs, sqlSpec => sqlSrcGen.makeSql(sqlSpec));
  const multReprs = resultReprToSqlMap.size > 1;
  const res: QueryReprSqlPath[] = [];

  for (const [resultRepr, sql] of resultReprToSqlMap.entries())
  {
    const modQueryName = queryName.replace(/ /g, '-').toLowerCase();
    const reprDescn = resultRepr.toLowerCase().replace(/_/g, ' ');
    const sqlFileName = multReprs ? `${modQueryName}(${reprDescn}).sql` : `${modQueryName}.sql`;
    const sqlPath = path.join(outputDir, sqlFileName);
    const header = "-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
      "-- " + resultRepr + " results representation for " + queryName + "\n";

    await writeTextFile(sqlPath, header + sql + "\n", { avoidWritingSameContents: true });

    res.push({ queryName, resultRepr, sqlPath });
  }

  return res;
}

async function writeResultTypes
  (
    sqlSpec: SqlSpec,
    queryName: string,
    sqlPaths: QueryReprSqlPath[],
    params: string[],
    opts: SourceGenerationOptions
  )
  : Promise<void>
{
  const generated = makeQueryResultTypesSource(sqlSpec, queryName, sqlPaths, params, opts);

  const fileName = `${generated.compilationUnitName}.${opts.sourceLanguage.toLowerCase()}`;
  const outputFile = path.join(opts.resultTypesOutputDir, fileName);

  await writeTextFile(outputFile, generated.resultTypesSourceCode, { avoidWritingSameContents: true });
}

async function checkFilesAndDirectoriesExist
  (
    dbmdFile: string,
    opts: SourceGenerationOptions
  )
{
  await requireFileExists(dbmdFile, 'The database metadata file was not found.');
  await requireDirExists(opts.resultTypesOutputDir, 'The result types source output directory was not found.');
  await requireDirExists(opts.sqlOutputDir, 'The SQL output directory was not found.');
  if (opts.sqlSpecOutputDir)
    await requireDirExists(opts.sqlSpecOutputDir, 'The SQL specifications output directory was not found.');
  if (opts.queryPropertiesOutputDir)
    await requireDirExists(opts.queryPropertiesOutputDir, 'The query properties output directory was not found.');
  if (opts?.typesHeaderFile)
    await requireFileExists(opts.typesHeaderFile, 'The types header file was not found.');
}

function makeSpecLocationError(e: SpecError): Error
{
  return new Error(
    "Error in query specification.\n" +
    "-----------------------------\n" +
    "In query: " + e.specLocation.queryName + "\n" +
    (e.specLocation.queryPart ? "At part: " + e.specLocation.queryPart + "\n" : '') +
    "Problem: " + e.problem + "\n" +
    "-----------------------------\n"
  );
}
