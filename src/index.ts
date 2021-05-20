import {promises as fs} from 'fs'; // for some older node versions (e.g. v10)
import * as path from 'path';
import * as process from 'process';
import {
  valueOr,
  propertyNameDefaultFunction,
  requireDirExists,
  requireFileExists,
  upperCamelCase
} from './util';
import {DatabaseMetadata} from './database-metadata';
import {SourceGenerationOptions, SourceLanguage} from './source-generation-options';
import {QueryGroupSpec, ResultRepr, SpecError} from './query-specs';
import {QuerySqlGenerator} from './query-sql-generator';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {ResultTypesSourceGenerator} from './result-types-source-generator';

export * from './source-generation-options';
export * from './query-specs';
export * from './result-types';
export * from './relations-md-generator';

export async function generateQueries
  (
    querySpecs: QueryGroupSpec | string, // string should be a path to a json file or js module file
    dbmdFile: string,
    srcOutputDir: string,
    sqlOutputDir: string,
    opts: SourceGenerationOptions = {}
  )
  : Promise<void>
{
  try
  {
    await requireFileExists(dbmdFile, 'Database metadata file not found.');
    await requireDirExists(srcOutputDir, 'Source output directory not found.');
    await requireDirExists(sqlOutputDir, 'Queries output directory not found.');
    if ( opts.typesHeaderFile ) await requireFileExists(opts.typesHeaderFile, 'Types header file not found.');

    const dbmd = await readDatabaseMetadata(dbmdFile);
    const queryGroupSpec = await readQueryGroupSpec(querySpecs);
    const defaultSchema = queryGroupSpec.defaultSchema || null;
    const srcLang = opts.sourceLanguage || 'TS';
    const unqualifiedNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas);
    const propNameFn = propertyNameDefaultFunction(queryGroupSpec.propertyNameDefault);
    const sqlGen = new QuerySqlGenerator(dbmd, defaultSchema, unqualifiedNameSchemas, propNameFn);
    const resultTypesSrcGen = new ResultTypesSourceGenerator(dbmd, defaultSchema, propNameFn);

    for ( const querySpec of queryGroupSpec.querySpecs )
    {
      const resReprSqls = sqlGen.generateSqls(querySpec);
      const sqlPaths = await writeResultReprSqls(querySpec.queryName, resReprSqls, sqlOutputDir);

      if ( valueOr(querySpec.generateResultTypes, true) )
      {
        const outputFileName = makeResultTypesFileName(querySpec.queryName, srcLang);
        const resultTypesSrc = await resultTypesSrcGen.makeQueryResultTypesSource(querySpec, sqlPaths, outputFileName, opts);
        await fs.writeFile(path.join(srcOutputDir, outputFileName), resultTypesSrc);
      }
    }
  }
  catch (e)
  {
    if ( e instanceof SpecError ) throw makeSpecLocationError(e);
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

async function readDatabaseMetadata(dbmdFile: string): Promise<DatabaseMetadata>
{
  const dbmdStoredPropsJson = await fs.readFile(dbmdFile, 'utf8');
  // TODO: Validate the dbmd file contents somehow here.
  return new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));
}

async function readQueriesSpecFile(filePath: string): Promise<QueryGroupSpec>
{
  const fileExt = path.extname(filePath).toLowerCase();
  if ( fileExt === '.ts' || fileExt === '.js' ) // .ts only supported when running via ts-node or deno.
  {
    const modulePath = filePath.startsWith('./') ? process.cwd() + filePath.substring(1) : filePath;
    const mod = await import(modulePath);
    return mod.default;
  }
  else
    throw new Error('Unrecognized file extension for query specs file.');
}

async function writeResultReprSqls
  (
    queryName: string,
    resultReprToSqlMap: Map<ResultRepr,string>,
    outputDir: string
  )
  : Promise<QueryReprSqlPath[]>
{
  const multReprs = resultReprToSqlMap.size > 1;
  const res: QueryReprSqlPath[] = [];

  for (const [resultRepr, sql] of resultReprToSqlMap.entries())
  {
    const modQueryName = queryName.replace(/ /g, '-').toLowerCase();
    const reprDescr = resultRepr.toLowerCase().replace(/_/g, ' ');
    const sqlFileName = multReprs ? `${modQueryName}(${reprDescr}).sql` : `${modQueryName}.sql`;
    const sqlPath = path.join(outputDir, sqlFileName);

    await fs.writeFile(sqlPath,
      "-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
      "-- " + resultRepr + " results representation for " + queryName + "\n" +
      sql + "\n"
    );

    res.push({ queryName, resultRepr, sqlPath });
  }

  return res;
}

function makeResultTypesFileName(queryName: string, sourceLanguage: SourceLanguage): string
{
  switch (sourceLanguage)
  {
    case 'TS': return queryName.replace(/ /g, '-').toLowerCase() + ".ts";
    case 'Java': return upperCamelCase(queryName) + ".java";
    default: throw new Error("Unrecognized source language");
  }
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
