import * as path from 'path';
import {promises as fs} from 'fs';
import {readTextFile, requireFileExists, writeTextFile} from './util/files';
import {parseArgs, parseBoolOption} from './util/args';
import {Nullable, replaceAll} from './util/mod';
import {QueryGroupSpec, ResultRepr, SpecError} from './query-specs';
import {SourceGenerationOptions, SourceLanguage} from './source-generation-options';
import {QueryPropertiesMetadata} from './query-props-md-gen';
import {DatabaseMetadata, GeneratedResultTypes, GeneratedSql, generateQueryGroupSources, parseStoredDatabaseMetadata} from './lib';

export * from './lib';
export * from './dbmd/gen/gen-dbmd-lib';
export * from './dbmd/gen/gen-relsmd-lib';
export * from './dbmd/relations-md-source-generator';

export interface QueryGenerationOptions
{
  readonly dbmdFile: string;
  readonly sqlOutputDir: string;
  readonly sqlSpecOutputDir?: Nullable<string>;
  readonly queryPropsMdOutputDir?: Nullable<string>;
  readonly tsOutputDir?: Nullable<string>;
  readonly tsTypesHeaderFile?: Nullable<string>;
  readonly javaBaseOutputDir?: Nullable<string>;
  readonly javaPackage?: Nullable<string>;
  readonly javaEmitRecords?: Nullable<boolean>;
  readonly javaTypesHeaderFile?: Nullable<string>;
}

export async function generateQueriesWithArgvOptions
  (
    queryGroupSpec: QueryGroupSpec,
    args: string[],
  )
{
  const requiredNamedArgs = [
    'dbmd', // database metadata json file path
    'sqlDir'
  ];
  const optionalNamedArgs = [
    'sqlSpecDir',
    'propsMdDir',
    'tsDir', 'tsTypesHeader',
    'javaBaseDir', 'javaPackage', 'javaTypesHeader', 'javaEmitRecords'
  ];

  const parsedArgs = parseArgs(args, requiredNamedArgs, optionalNamedArgs, 0);
  if ( typeof parsedArgs === 'string' ) // arg parsing error
    throw new Error(parsedArgs);

  const opts: QueryGenerationOptions = {
    dbmdFile: parsedArgs['dbmd'],
    sqlOutputDir: parsedArgs['sqlDir'],
    sqlSpecOutputDir: parsedArgs['sqlSpecDir'],
    queryPropsMdOutputDir: parsedArgs['propsMdDir'],
    tsOutputDir: parsedArgs['tsDir'],
    tsTypesHeaderFile: parsedArgs['tsTypesHeader'],
    javaBaseOutputDir: parsedArgs['javaBaseDir'],
    javaPackage: parsedArgs['javaPackage'] ?? '',
    javaEmitRecords: parseBoolOption(parsedArgs['javaEmitRecords'] ?? 'true', 'javaEmitRecords'),
    javaTypesHeaderFile: parsedArgs['javaTypesHeader'],
  };

  if ( opts.sqlOutputDir == null )
    throw new Error('SQL output directory is required.');
  if ( opts.tsOutputDir == null && opts.javaBaseOutputDir == null )
    throw new Error('An output directory for result types is required.');

  await requireFileExists(opts.dbmdFile, 'The database metadata file was not found.');

  await createOutputDirs(opts);

  try
  {
    generateQueries(queryGroupSpec, opts);
  }
  catch (e)
  {
    if (e instanceof SpecError)
      throw new Error(
        "Error in query specification.\n" +
        "-----------------------------\n" +
        "In query: " + e.specLocation.queryName + "\n" +
        (e.specLocation.queryPart ? "At part: " + e.specLocation.queryPart + "\n" : '') +
        "Problem: " + e.problem + "\n" +
        "-----------------------------\n"
      );
    else throw e; // unexpected error
  }
}

export async function generateQueries
  (
    queryGroupSpec: QueryGroupSpec,
    opts: QueryGenerationOptions
  )
  : Promise<void>
{
  // Generate SQL source files if specified.

  const dbmd = await readDatabaseMetadata(opts.dbmdFile);

  const srcGenOpts: SourceGenerationOptions = {
    resultTypeLanguages: resultTypeLanguages(opts),
    typesHeaders: await readTypesHeaderFiles(opts),
    customPropertyTypeFn: null, // not available for command line executions
    javaPackage: opts.javaPackage,
    javaEmitRecords: opts.javaEmitRecords
  };

  const querySourcess = generateQueryGroupSources(queryGroupSpec, dbmd, srcGenOpts);
  const typesOutputDirs = { 'TS': opts.tsOutputDir, 'Java': getJavaOutputDir(opts) };

  for (const querySources of querySourcess)
  {
    const qname = querySources.query.queryName;

    await writeSqls(querySources.generatedSqlsByResultRepr, qname, opts.sqlOutputDir);

    if (querySources.generatedResultTypes)
      await writeResultTypes(querySources.generatedResultTypes, typesOutputDirs);

    if (opts.sqlSpecOutputDir)
      await writeSqlSpecs(querySources.generatedSqlsByResultRepr, qname, opts.sqlSpecOutputDir);

    if (opts.queryPropsMdOutputDir)
      await writePropertiesMetadata(querySources.queryPropertiesMetadata, qname, opts.queryPropsMdOutputDir);
  }

  console.log(
    `Wrote sources for ${querySourcess.length} queries to the following directories: \n` +
    `  SQL sources => ${opts.sqlOutputDir}\n` +
    '  Result type sources: \n' +
    `${typesOutputDirs.Java ? `    Java => ${typesOutputDirs.Java}\n` : ''}` +
    `${typesOutputDirs.TS ? `    TypeScript => ${typesOutputDirs.TS}\n` : ''}` +
    (opts.sqlSpecOutputDir ? `  SQL Specs => ${opts.sqlSpecOutputDir}\n` : '') +
    (opts.queryPropsMdOutputDir ? `  Query properties metadata => ${opts.queryPropsMdOutputDir}\n` : '')
  );
}

async function writeSqls
  (
    sqlsByResultRepr: Map<ResultRepr, GeneratedSql>,
    queryName: string,
    outputDir: string
  )
  : Promise<void>
{
  const multReprs = sqlsByResultRepr.size > 1;

  for (const [resultRepr, genSql] of sqlsByResultRepr.entries())
  {
    const modQueryName = queryName.replace(/ /g, '-').toLowerCase();
    const reprDescn = resultRepr.toLowerCase().replace(/_/g, ' ');
    const sqlFileName = multReprs ? `${modQueryName}(${reprDescn}).sql` : `${modQueryName}.sql`;
    const sqlPath = path.join(outputDir, sqlFileName);
    const header = "-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
      "-- " + resultRepr + " results representation for " + queryName + "\n";

    await writeTextFile(sqlPath, header + genSql.sqlText + '\n', { avoidWritingSameContents: true });
  }
}

async function writeResultTypes
  (
    resultTypes: GeneratedResultTypes,
    outputDirs: { [l in SourceLanguage]: Nullable<string> }
  )
  : Promise<void>
{
  for (const [srcLang, resTypesSrc] of resultTypes.sourceCodeByLanguage.entries())
  {
    const outputDir = outputDirs[srcLang];
    if (!outputDir) throw new Error(`Expected output directory for language ${srcLang}.`);
    const outputFile = path.join(outputDir, resTypesSrc.compilationUnitName);
    await writeTextFile(outputFile, resTypesSrc.sourceCode, { avoidWritingSameContents: true });
  }
}

async function writeSqlSpecs
  (
    sqlsByResultRepr: Map<ResultRepr, GeneratedSql>,
    queryName: string,
    outputDir: string
  )
  : Promise<void>
{
  const multReprs = sqlsByResultRepr.size > 1;

  for (const [resultRepr, genSql] of sqlsByResultRepr.entries())
  {
    const modQueryName = queryName.replace(/ /g, '-').toLowerCase();
    const reprDescn = resultRepr.toLowerCase().replace(/_/g, ' ');
    const sqlSpecFileName = multReprs ? `${modQueryName}(${reprDescn}).json` : `${modQueryName}.json`;
    const sqlSpecPath = path.join(outputDir, sqlSpecFileName);

    await writeTextFile(
      sqlSpecPath,
      JSON.stringify(genSql.sqlSpec, null, 2) + '\n',
      { avoidWritingSameContents: true }
    );
  }
}

async function writePropertiesMetadata
  (
    propsMd: QueryPropertiesMetadata,
    queryName: string,
    outputDir: string
  )
  : Promise<void>
{
  const fileName = queryName.replace(/ /g, '-').toLowerCase() + '-properties.json';
  const propsMdPath = path.join(outputDir, fileName);

  await writeTextFile(
    propsMdPath,
    JSON.stringify(propsMd, null, 2),
    { avoidWritingSameContents: true }
  );
}

async function readDatabaseMetadata(dbmdFile: string): Promise<DatabaseMetadata>
{
  const jsonText = await readTextFile(dbmdFile);
  const dbmdStoredProps = parseStoredDatabaseMetadata(jsonText);
  return new DatabaseMetadata(dbmdStoredProps);
}

async function createOutputDirs(opts: QueryGenerationOptions): Promise<void>
{
  await fs.mkdir(opts.sqlOutputDir, { recursive: true });

  if (opts.sqlSpecOutputDir)
    await fs.mkdir(opts.sqlSpecOutputDir, { recursive: true });

  if (opts.queryPropsMdOutputDir)
    await fs.mkdir(opts.queryPropsMdOutputDir, { recursive: true });

  if (opts.tsOutputDir)
    await fs.mkdir(opts.tsOutputDir, { recursive: true });

  const javaOutputDir = getJavaOutputDir(opts);
  if (javaOutputDir)
    await fs.mkdir(javaOutputDir, { recursive: true });
}

function resultTypeLanguages(opts: QueryGenerationOptions): SourceLanguage[]
{
  return <SourceLanguage[]>
    (opts.javaBaseOutputDir ? ['Java'] : [])
    .concat(opts.tsOutputDir ? ['TS'] : []);
}

async function readTypesHeaderFiles(opts: QueryGenerationOptions): Promise<Map<SourceLanguage,string>>
{
  const res = new Map();

  const tsHeaderFile = opts.tsTypesHeaderFile;
  if (tsHeaderFile)
  {
    requireFileExists(tsHeaderFile, 'The TypeScript result types header file was not found.');
    res.set('TS', await readTextFile(tsHeaderFile));
  }

  const javaHeaderFile = opts.javaTypesHeaderFile;
  if (javaHeaderFile)
  {
    requireFileExists(javaHeaderFile, 'The Java result types header file was not found.');
    res.set('Java', await readTextFile(javaHeaderFile));
  }

  return res;
}

function getJavaOutputDir(opts: QueryGenerationOptions): Nullable<string>
{
  return opts.javaBaseOutputDir
    ? `${opts.javaBaseOutputDir}/${replaceAll(opts.javaPackage ?? '', '.', '/')}`
    : null;
}
