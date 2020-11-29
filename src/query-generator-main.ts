import * as fs from 'fs/promises';
import * as path from 'path';

import {splitArgs} from './util/args';
import {valueOr} from './util/nullability';
import {DatabaseMetadata} from './database-metadata/database-metadata';
import {QueryGroupSpec, QuerySpec, ResultRepr, TableJsonSpec} from './query-specs';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {QuerySqlGenerator} from './query-sql-generator';
import {ResultTypesGenerator} from './result-types-generator';
import {TSModulesWriter} from './ts-modules-writer';
import {propertyNameDefaultFunction} from './util/property-names';

function printUsage(to: 'stderr' | 'stdout')
{
  const out = to === 'stderr' ? console.error : console.log;
  out("Expected arguments: [options] <db-metadata-file> <queries-spec-file> <result-types-output-dir> <sql-output-dir>");
  out("Options:");
  out(`   --${opts.sqlResourcePathPrefix}=<path> - A prefix to the SQL file name ` +
    "written into source code.");
  out(`   --${opts.typesHeaderFile}=<file> - Contents of this file will be ` +
    "included at the top of each generated module source file (e.g. for additional imports).");
  out(`   --${opts.help} - Show this message.`);
}

export async function main(appArgs: string[])
{
  const args = splitArgs(appArgs);

  let validOpts = new Set(Object.values(opts));
  const invalidOpt = Object.keys(args.named).find(optName => !validOpts.has(optName));
  if (invalidOpt)
    throw new Error(`Option name '${invalidOpt}' is not valid.`);

  if (args.named["--help"]) { printUsage('stdout'); return; }
  if (args.positional.length != 4) { printUsage('stderr'); throw new Error("Expected 4 non-option arguments."); }

  const dbmdFile = args.positional[0];
  if (!(await fs.stat(dbmdFile)).isFile())
    throw new Error('Database metadata file not found.');

  const queriesSpecFile = args.positional[1];
  if (!(await fs.stat(queriesSpecFile)).isFile())
    throw new Error('Queries specification file not found.');

  const sourceOutputDir = args.positional[2];
  if (!(await fs.stat(sourceOutputDir)).isDirectory())
    throw new Error('Source output directory not found.');

  const queriesOutputDir = args.positional[3];
  if (!(await fs.stat(queriesOutputDir)).isDirectory())
    throw new Error('Queries output directory not found.');

  const srcGenOpts = {
    sqlResourcePathPrefix: args.named[opts.sqlResourcePathPrefix] || '',
    typesHeaderFile: args.named[opts.typesHeaderFile] || null
  };

  try
  {
    await generateQueries({dbmdFile, queriesSpecFile}, {sourceOutputDir, queriesOutputDir}, srcGenOpts);
  }
  catch (e)
  {
    if (e.specLocation)
    {
      console.error("\n" +
        "-----------------------------\n" +
        "Error in query specification.\n" +
        "-----------------------------\n" +
        "In query: " + e.specLocation.queryName + "\n" +
        (e.specLocation.queryPart ? "At part: " + e.specLocation.queryPart + "\n" : '') +
        "Problem: " + e.problem + "\n" +
        "-----------------------------\n"
      );
    }
    else
      console.error("Error occurred in query generator: ", e);

    process.exit(1);
  }
}

async function generateQueries
  (
    inputPaths: InputPaths,
    outputPaths: OutputPaths,
    opts: SourceGenerationOptions
  )
{
  const dbmdStoredPropsJson = await fs.readFile(inputPaths.dbmdFile, 'utf8');
  const dbmd = new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));
  const queryGroupSpec = await readQueriesSpecFile(inputPaths.queriesSpecFile);

  const srcWriter = new TSModulesWriter(outputPaths.sourceOutputDir, opts.sqlResourcePathPrefix, opts.typesHeaderFile);

  const defaultSchema = queryGroupSpec.defaultSchema || null;
  const unqualifiedNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas);
  const propNameFn = propertyNameDefaultFunction(queryGroupSpec.outputFieldNameDefault);

  const sqlGen = new QuerySqlGenerator(dbmd, defaultSchema, unqualifiedNameSchemas, propNameFn);

  const resultTypesGen = new ResultTypesGenerator(dbmd, defaultSchema, propNameFn);

  for (const querySpec of queryGroupSpec.querySpecs)
  {
    // Generate SQL for each of the query's specified result representations.
    const resReprSqls = sqlGen.generateSqls(querySpec);

    // Write query SQLs.
    const sqlPaths = await writeResultReprSqls(querySpec.queryName, resReprSqls, outputPaths.queriesOutputDir);

    if (valueOr(querySpec.generateResultTypes, true))
    {
      const resultTypes = resultTypesGen.generateResultTypes(querySpec.tableJson);
      const paramNames = getQuerySpecParamNames(querySpec);
      const header = querySpec.typesFileHeader || null;

      await srcWriter.writeModule(querySpec.queryName, resultTypes, paramNames, sqlPaths, header);
    }
  }
}

async function readQueriesSpecFile(filePath: string): Promise<QueryGroupSpec>
{
  const fileExt = path.extname(filePath).toLowerCase();
  if (fileExt === '.ts' || fileExt === '.js')
  {
    const tsModule = await import(filePath)
    return tsModule.default;
  }
  else if (fileExt === '.json')
  {
    const queryGroupSpecJson = await fs.readFile(filePath, 'utf8');
    return JSON.parse(queryGroupSpecJson);
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

function getQuerySpecParamNames(querySpec: QuerySpec): string[]
{
  return getParamNames(querySpec.tableJson);
}

function getParamNames(tableJsonSpec: TableJsonSpec): string[]
{
  const paramNames: string[] = [];

  for (const childSpec of tableJsonSpec.childTableCollections || [])
    paramNames.push(...getParamNames(childSpec.tableJson));

  for (const parentSpec of tableJsonSpec.inlineParentTables || [])
    paramNames.push(...getParamNames(parentSpec.tableJson));

  for (const parentSpec of tableJsonSpec.referencedParentTables || [])
    paramNames.push(...getParamNames(parentSpec.tableJson));

  if (tableJsonSpec?.recordCondition?.paramNames != null)
    paramNames.push(...tableJsonSpec.recordCondition.paramNames);

  return paramNames;
}

const opts = {
  sqlResourcePathPrefix: "sql-resource-path-prefix",
  typesHeaderFile: "types-header-file",
  help: "help"
};

interface SourceGenerationOptions
{
  sqlResourcePathPrefix: string;
  typesHeaderFile: string | null;
}

interface InputPaths
{
  dbmdFile: string,
  queriesSpecFile: string
}

interface OutputPaths
{
  sourceOutputDir: string
  queriesOutputDir: string
}

main(process.argv.slice(2));
