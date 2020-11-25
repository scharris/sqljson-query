import * as fs from 'fs/promises';
import * as path from 'path';

import {splitArgs} from './util/args';
import {DatabaseMetadata, RelMetadata} from './database-metadata/database-metadata';
import {makeArrayValuesMap} from './util/collections';
import {valueOr} from './util/nullability';
import {indentLines} from './util/strings';

function printUsage(to: 'stderr' | 'stdout')
{
   const out = to === 'stderr' ? console.error : console.log;
   out("Expected arguments: [options] <db-metadata-file> <src-output-dir>");
   out("Options:");
   out(`   --${opts.help} - Show this message.`);
}

export async function main(appArgs: string[])
{
   const args = splitArgs(appArgs);

   let validOpts = new Set(Object.values(opts));
   const invalidOpt = Object.keys(args.named).find(optName => !validOpts.has(optName));
   if ( invalidOpt )
      throw new Error(`Option name '${invalidOpt}' is not valid.`);

   if ( args.named["--help"] ) { printUsage('stdout'); return; }

   if ( args.positional.length != 2 ) { printUsage('stderr'); throw new Error("Expected 2 non-option arguments."); }

   const dbmdFile = args.positional[0];
   if ( !(await fs.stat(dbmdFile)).isFile() )
      throw new Error('Database metadata file not found.');

   const sourceOutputDir = args.positional[1];
   if ( !(await fs.stat(sourceOutputDir)).isDirectory() )
      throw new Error('Source output directory not found.');

   try
   {
      await writeRelationsMetadataModule(dbmdFile, sourceOutputDir);
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
      parts.push(`   ${lit(f.name)}: {`);
      parts.push(`"type": ${lit(f.databaseType)}, `);
      parts.push(`"null": ${f.nullable}, `);
      const pkPartNum = f.primaryKeyPartNumber;
      parts.push(`"pkPart": ${pkPartNum != null ? pkPartNum.toString() : "null"}, `);
      parts.push(`"len": ${f.length}, `);
      parts.push(`"prec": ${f.precision}, `);
      parts.push(`"precRadix": ${f.precisionRadix}, `);
      parts.push(`"scale": ${f.fractionalDigits}`);
      parts.push("},\n");
   }

   parts.push("},\n");

   return parts.join('');
}

function lit(s: string)
{
   return "\"" + s.replace(/"/g, '\\"') + "\"";
}

const opts = {
   help: "help"
};

main(process.argv.slice(2));
