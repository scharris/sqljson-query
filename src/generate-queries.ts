import * as fs from 'fs/promises';
import * as path from 'path';
import {parseAppArgs} from './util/args';
import {valueOr} from './util/nullability';
import {DatabaseMetadata} from './database-metadata/database-metadata';
import {QueryGroupSpec, QuerySpec, ResultRepr, TableJsonSpec} from './query-specs';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {QuerySqlGenerator} from './query-sql-generator';
import {ResultTypesGenerator} from './result-types-generator';
import {TSModulesWriter} from './ts-modules-writer';
import {propertyNameDefaultFunction} from './util/property-names';
import {requireDirExists, requireFileExists} from './util/files';

export async function generate
  (
    dbmdFile: string,
    querySpecsFile: string,
    typesOutputDir: string,
    sqlOutputDir: string,
    opts: SourceGenerationOptions
  )
  : Promise<void>
{
  await requireFileExists(dbmdFile, 'Database metadata file not found.');
  await requireFileExists(querySpecsFile, 'Query specifications file not found.');
  await requireDirExists(typesOutputDir, 'Source output directory not found.');
  await requireDirExists(sqlOutputDir, 'Queries output directory not found.');

  try
  {
    const dbmdStoredPropsJson = await fs.readFile(dbmdFile, 'utf8');
    const dbmd = new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));
    const queryGroupSpec = await readQueriesSpecFile(querySpecsFile);
  
    const srcWriter = new TSModulesWriter(typesOutputDir, opts.sqlResourcePathPrefix, opts.typesHeaderFile);
  
    const defaultSchema = queryGroupSpec.defaultSchema || null;
    const unqualifiedNameSchemas = new Set(queryGroupSpec.generateUnqualifiedNamesForSchemas);
    const propNameFn = propertyNameDefaultFunction(queryGroupSpec.outputFieldNameDefault);
  
    const sqlGen = new QuerySqlGenerator(dbmd, defaultSchema, unqualifiedNameSchemas, propNameFn);
  
    const resultTypesGen = new ResultTypesGenerator(dbmd, defaultSchema, propNameFn);

    for ( const querySpec of queryGroupSpec.querySpecs )
    {
      const resReprSqls = sqlGen.generateSqls(querySpec);

      const sqlPaths = await writeResultReprSqls(querySpec.queryName, resReprSqls, sqlOutputDir);
    
      if ( valueOr(querySpec.generateResultTypes, true) )
      {
        const resultTypes = resultTypesGen.generateResultTypes(querySpec.tableJson);
        const paramNames = getQuerySpecParamNames(querySpec);
        const header = querySpec.typesFileHeader || null;
    
        await srcWriter.writeModule(querySpec.queryName, resultTypes, paramNames, sqlPaths, header);
      }
    }
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

interface SourceGenerationOptions
{
  sqlResourcePathPrefix: string;
  typesHeaderFile: string | null;
}

function printUsage(to: 'stderr' | 'stdout')
{
  const out = to === 'stderr' ? console.error : console.log;
  out(`Expected arguments: [options] ${reqdNamedParams.map(p => "--" + p).join(" ")}`);
  out("Options:");
  out(`   --sql-resource-path-prefix <path> - A prefix to the SQL file name written into source code.`);
  out(`   --types-header-file <file> - Contents of this file will be ` +
    "included at the top of each generated module source file (e.g. for additional imports).");
  out(`   --help - Show this message.`);
}

////////////
// Start
////////////

const reqdNamedParams = ['dbmd-file', 'query-specs-file', 'types-output-dir', 'sql-output-dir'];
const optlNamedParams = ['sql-resource-path-prefix', 'types-header-file'];

const argsParseResult = parseAppArgs(process.argv.slice(2), reqdNamedParams, optlNamedParams, 0);

if ( typeof argsParseResult === 'string' )
{
  if ( argsParseResult === 'help' )
  {
    console.log('Help requested:');
    printUsage('stdout');
    process.exit(0);
  }
  else // error
  {
    console.error(`Error: ${argsParseResult}`);
    process.exit(1);
  }
}

generate(
  argsParseResult['dbmd-file'],
  argsParseResult['query-specs-file'],
  argsParseResult['types-output-dir'],
  argsParseResult['sql-output-dir'],
  { 
    sqlResourcePathPrefix: argsParseResult['sql-resource-path-prefix'] || '',
    typesHeaderFile: argsParseResult['types-header-file'] || null
  }
)
.catch(err => {
  console.error(err);
  process.exit(1);
});
