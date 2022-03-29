import * as path from 'path';
import {
  propertyNameDefaultFunction,
  requireDirExists,
  requireFileExists,
  writeTextFile,
  cwd,
  mapValues,
  firstValue
} from './util/mod';
import { readDatabaseMetadata } from './dbmd';
import { QueryGroupSpec, QuerySpec, ResultRepr, SpecError } from './query-specs';
import { SourceGenerationOptions } from './source-generation-options';
import { ResultTypeSourceGenerator, QueryReprSqlPath } from './result-type-generation';
import { SqlSourceGenerator } from './sql-generation/sql-source-generator';
import { SqlSpecGenerator } from './sql-generation/sql-spec-generator';
import { SqlSpec } from './sql-generation/sql-specs';
import { getSqlDialect } from './sql-generation';
import { makeQueryPropertiesMetadata } from './result-metadata-generation/query-properties-metadata-generator';

export * from './source-generation-options';
export * from './query-specs';
export * from './result-type-generation';
export * from './dbmd/relations-md-source-generator';

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
    const defaultSchema = queryGroupSpec.defaultSchema || null;
    const unqualNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas);
    const propNameFn = propertyNameDefaultFunction(queryGroupSpec.propertyNameDefault, dbmd.caseSensitivity);

    // generators
    const sqlSpecGen = new SqlSpecGenerator(dbmd, defaultSchema, propNameFn);
    const sqlSrcGen = new SqlSourceGenerator(getSqlDialect(dbmd, 2), dbmd.caseSensitivity, unqualNameSchemas);
    const resultTypesSrcGen = new ResultTypeSourceGenerator(dbmd, defaultSchema, propNameFn);

    for (const querySpec of queryGroupSpec.querySpecs)
    {
      const sqlSpecsByRepr = sqlSpecGen.generateSqlSpecs(querySpec);

      if (opts.sqlSpecOutputDir)
        await writeSqlSpecs(querySpec.queryName, sqlSpecsByRepr, opts.sqlSpecOutputDir);

      if (opts.queryPropertiesOutputDir)
        await writePropertiesMetadata(firstValue(sqlSpecsByRepr), querySpec.queryName, opts.queryPropertiesOutputDir);

      const sqlPaths = await writeSqls(querySpec.queryName, sqlSpecsByRepr, sqlSrcGen, opts.sqlOutputDir);

      if (querySpec.generateResultTypes ?? true)
        await writeResultTypes(resultTypesSrcGen, querySpec, sqlPaths, opts);
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
    queryName: string,
    resultReprToSqlSpecMap: Map<ResultRepr,SqlSpec>,
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
    queryName: string,
    sqlSpecs: Map<ResultRepr,SqlSpec>,
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
    resultTypesSrcGen: ResultTypeSourceGenerator,
    querySpec: QuerySpec,
    sqlPaths: QueryReprSqlPath[],
    opts: SourceGenerationOptions
  )
  : Promise<void>
{
  const { resultTypesSourceCode, compilationUnitName } =
    resultTypesSrcGen.makeQueryResultTypesSource(querySpec, sqlPaths, opts);

  const fileName = `${compilationUnitName}.${opts.sourceLanguage.toLowerCase()}`;
  const resultTypesOutputFile = path.join(opts.resultTypesOutputDir, fileName);

  await writeTextFile(resultTypesOutputFile, resultTypesSourceCode, { avoidWritingSameContents: true });
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
