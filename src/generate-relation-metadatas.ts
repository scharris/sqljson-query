import * as fs from 'fs/promises';
import * as path from 'path';
import {DatabaseMetadata, RelMetadata} from './database-metadata/database-metadata';
import {makeArrayValuesMap} from './util/collections';
import {valueOr} from './util/nullability';
import {indentLines} from './util/strings';
import {parseAppArgs} from './util/args';
import {requireDirExists, requireFileExists} from './util/files';

export async function generate
  (
    dbmdFile: string,
    srcOutputDir: string
  )
{
  await requireFileExists(dbmdFile, 'Database metadata file not found.');
  await requireDirExists(srcOutputDir, 'Source output directory not found.');

  try
  {
    await writeRelationsMetadataModule(dbmdFile, srcOutputDir);
  }
  catch( e )
  {
    console.error("Error occurred in relation metadata generator: ", e);
    process.exit(1);
  }
}

async function writeRelationsMetadataModule
  (
    dbmdFile: string,
    sourceOutputDir: string
  )
{
  const dbmdStoredPropsJson = await fs.readFile(dbmdFile, 'utf8');
  const dbmd = new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));

  const outputFile = path.join(sourceOutputDir, "relations.ts");

  await fs.writeFile(outputFile, getCommonFileHeader() + "\n\n" + relationsModuleSource(dbmd));
}

function getCommonFileHeader(): string
{
  return (
    "// ---------------------------------------------------------------------------\n" +
    "// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]\n" +
    "// ---------------------------------------------------------------------------\n"
  );
}

function relationsModuleSource(dbmd: DatabaseMetadata): string
{
  const parts: string[] = [];

  const schemaToRelMdsMap =
    makeArrayValuesMap(dbmd.relationMetadatas,
      relMd => valueOr(relMd.relationId.schema, "DEFAULT"),
      relMd => relMd
    );

  for ( const [schema, relMds] of schemaToRelMdsMap.entries() )
  {
    parts.push(`export const ${schema} = { // schema '${schema}'\n`);

    for ( const relMd of relMds )
    {
      parts.push(indentLines(relationMetadataSource(relMd), 3));
      parts.push("\n");
    }

    parts.push("};\n"); // close schema object
  }

  return parts.join('');
}

function relationMetadataSource(relMd: RelMetadata): string
{
  const parts: string[] = [];

  const relName = relMd.relationId.name;
  parts.push(`"${relName}": { // relation '${relName}'\n`);

  for ( const f of relMd.fields )
  {
    parts.push(`   ${lit(f.name)}: { `);
    parts.push(`type: ${lit(f.databaseType)}, `);
    parts.push(`nullable: ${f.nullable}, `);
    const pkPartNum = f.primaryKeyPartNumber;
    parts.push(`pkPart: ${pkPartNum != null ? pkPartNum.toString() : "null"}, `);
    parts.push(`len: ${f.length}, `);
    parts.push(`prec: ${f.precision}, `);
    parts.push(`precRadix: ${f.precisionRadix}, `);
    parts.push(`scale: ${f.fractionalDigits}`);
    parts.push(" },\n");
  }

  parts.push("},\n");

  return parts.join('');
}

function lit(s: string)
{
  return "\"" + s.replace(/"/g, '\\"') + "\"";
}

function printUsage(to: 'stderr' | 'stdout')
{
  const out = to === 'stderr' ? console.error : console.log;
  out("Expected arguments: --dbmd-file <file> --output-dir <dir>");
}

////////////
// Start
////////////

const argsParseResult = parseAppArgs(process.argv.slice(2), ['dbmd-file', 'output-dir'], [], 0);

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

generate(argsParseResult['dbmd-file'], argsParseResult['output-dir'])
.catch(err => {
  console.error(err);
  process.exit(1);
});
