import {path} from './deps.ts';
import {
  valueOr,
  propertyNameDefaultFunction,
  requireDirExists,
  requireFileExists,
  missingCase,
  upperCamelCase,
  writeTextFile,
  readTextFile,
  cwd
} from './util/mod.ts';
import {DatabaseMetadata} from './database-metadata.ts';
import {SourceGenerationOptions, SourceLanguage} from './source-generation-options.ts';
import {QueryGroupSpec, ResultRepr, SpecError} from './query-specs.ts';
import {QuerySqlGenerator} from './query-sql-generator.ts';
import {QueryReprSqlPath} from './query-repr-sql-path.ts';
import {ResultTypesSourceGenerator} from './result-types-source-generator.ts';

export * from './source-generation-options.ts';
export * from './query-specs.ts';
export * from './result-types.ts';
export * from './relations-md-source-generator.ts';

export async function generateQuerySources
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
        await writeTextFile(path.join(srcOutputDir, outputFileName), resultTypesSrc);
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
  const dbmdStoredPropsJson = await readTextFile(dbmdFile);
  // TODO: Validate the dbmd file contents somehow here.
  return new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));
}

async function readQueriesSpecFile(filePath: string): Promise<QueryGroupSpec>
{
  const fileExt = path.extname(filePath).toLowerCase();
  if ( fileExt === '.ts' || fileExt === '.js' ) // .ts only supported when running via ts-node or deno.
  {
    const modulePath = filePath.startsWith('./') ? cwd() + filePath.substring(1) : filePath;
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

    await writeTextFile(sqlPath,
      "-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
      "-- " + resultRepr + " results representation for " + queryName + "\n" +
      sql + "\n"
    );

    res.push({ queryName, resultRepr, sqlPath });
  }

  return res;
}

function makeResultTypesFileName(queryName: string, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return queryName.replace(/ /g, '-').toLowerCase() + ".ts";
    case 'Java': return upperCamelCase(queryName) + ".java";
    default: missingCase(srcLang);
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

