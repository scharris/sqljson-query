import * as fs from 'fs/promises';
import * as path from 'path';
import {valueOr} from './util/nullability';
import {propertyNameDefaultFunction} from './util/property-names';
import {requireDirExists, requireFileExists} from './util/files';
import {DatabaseMetadata, DatabaseMetadataStoredProperties} from './database-metadata';
import {QueryGroupSpec, QuerySpec, ResultRepr, TableJsonSpec} from './query-specs';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {QuerySqlGenerator} from './query-sql-generator';
import {ResultTypesGenerator} from './result-types-generator';
import {TSModulesWriter} from './ts-modules-writer';
import {writeRelationsMetadataModule} from './relations-md-generator';
import {ResultType, SimpleTableFieldProperty} from './result-types';
import {validateJson} from './util/json-schemas';

const querySpecsSchema = require('./query-specs.schema.json');
const dbmdJsonSchema = require('./dbmd.schema.json');

export async function generateQueries
  (
    querySpecs: QueryGroupSpec | string, // string should be a path to a json file or js module file
    dbmdFile: string,
    tsOutputDir: string,
    sqlOutputDir: string,
    opts: SourceGenerationOptions
  )
  : Promise<void>
{
  try
  {
    await requireFileExists(dbmdFile, 'Database metadata file not found.');
    await requireDirExists(tsOutputDir, 'Source output directory not found.');
    await requireDirExists(sqlOutputDir, 'Queries output directory not found.');
    if ( opts.typesHeaderFile )
      await requireFileExists(opts.typesHeaderFile, 'Types header file not found.');
    
    let queryGroupSpec;
    if ( typeof querySpecs === 'string' )
    {
      await requireFileExists(querySpecs, 'Query specifications file not found.');
      queryGroupSpec = await readQueriesSpecFile(querySpecs);
    }
    else queryGroupSpec = querySpecs;
  
    const dbmd = await readDatabaseMetadata(dbmdFile);
  
    const srcWriter = new TSModulesWriter(tsOutputDir, opts);
  
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
        const resultTypes = resultTypesGen.generateResultTypes(querySpec.tableJson, querySpec.queryName);
        const paramNames = getQuerySpecParamNames(querySpec);
        const header = querySpec.typesFileHeader || null;
    
        await srcWriter.writeModule(querySpec.queryName, resultTypes, paramNames, sqlPaths, header);
      }
    }

    await writeRelationsMetadataModule(dbmdFile, tsOutputDir);
  }
  catch (e)
  {
    if ( e.specLocation )
      throw new Error( 
        "Error in query specification.\n" +
        "-----------------------------\n" +
        "In query: " + e.specLocation.queryName + "\n" +
        (e.specLocation.queryPart ? "At part: " + e.specLocation.queryPart + "\n" : '') +
        "Problem: " + e.problem + "\n" +
        "-----------------------------\n"
      );
    else
      throw e;
  }
}

async function readDatabaseMetadata(dbmdFile: string)
{
  const dbmdStoredPropsJson = await fs.readFile(dbmdFile, 'utf8');
  const dbmdStoredProps: DatabaseMetadataStoredProperties = validateJson("database metadata", dbmdStoredPropsJson, dbmdJsonSchema);
  return new DatabaseMetadata(dbmdStoredProps);
}

async function readQueriesSpecFile(filePath: string): Promise<QueryGroupSpec>
{
  const fileExt = path.extname(filePath).toLowerCase();
  if ( fileExt === '.ts' || fileExt === '.js' ) // .ts only supported when running via ts-node or deno.
  {
    const tsModule = await import(filePath)
    return tsModule.default;
  }
  else if (fileExt === '.json')
  {
    const queryGroupSpecJson = await fs.readFile(filePath, 'utf8');
    return validateJson("query specs", queryGroupSpecJson, querySpecsSchema) as QueryGroupSpec;
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

export type CustomPropertyTypeFn = (prop: SimpleTableFieldProperty, resultType: ResultType) => string | null;

export interface SourceGenerationOptions
{
  sqlResourcePathPrefix: string;
  typesHeaderFile: string | null;
  customPropertyTypeFn: CustomPropertyTypeFn | null;
}

export * from './query-specs';
export * from './result-types';

