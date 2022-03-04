import * as path from 'path';
import {
  valueOr,
  propertyNameDefaultFunction,
  requireDirExists,
  requireFileExists,
  writeTextFile,
  cwd
} from './util/mod';
import {readDatabaseMetadata} from './database-metadata';
import {SourceGenerationOptions} from './source-generation-options';
import {QueryGroupSpec, ResultRepr, SpecError} from './query-specs';
import {QuerySqlGenerator} from './query-sql-generator';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {ResultTypesSourceGenerator} from './result-types-source-generator';

export * from './source-generation-options';
export * from './query-specs';
export * from './result-types';
export * from './relations-md-source-generator';

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
    await requireFileExists(dbmdFile, 'The database metadata file was not found.');
    await requireDirExists(opts.resultTypesOutputDir, 'The result types source output directory was not found.');
    await requireDirExists(opts.sqlOutputDir, 'The SQL output directory was not found.');
    if ( opts?.typesHeaderFile )
      await requireFileExists(opts.typesHeaderFile, 'The types header file was not found.');

    const dbmd = await readDatabaseMetadata(dbmdFile);
    const queryGroupSpec = await readQueryGroupSpec(querySpecs);
    const defaultSchema = queryGroupSpec.defaultSchema || null;
    const unqualifiedNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas);
    const propNameFn = propertyNameDefaultFunction(queryGroupSpec.propertyNameDefault);
    const sqlGen = new QuerySqlGenerator(dbmd, defaultSchema, unqualifiedNameSchemas, propNameFn);
    const resultTypesSrcGen = new ResultTypesSourceGenerator(dbmd, defaultSchema, propNameFn);

    for ( const querySpec of queryGroupSpec.querySpecs )
    {
      const resReprSqls = sqlGen.generateSqls(querySpec);
      const sqlPaths = opts.sqlOutputDir ? await writeResultReprSqls(querySpec.queryName, resReprSqls, opts.sqlOutputDir) : [];

      if ( valueOr(querySpec.generateResultTypes, true) )
      {
        const gen = await resultTypesSrcGen.makeQueryResultTypesSource(querySpec, sqlPaths, opts);
        const outFile = path.join(opts.resultTypesOutputDir, `${gen.compilationUnitName}.${opts.sourceLanguage.toLowerCase()}`);

        await writeTextFile(outFile, gen.sourceCode);
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
