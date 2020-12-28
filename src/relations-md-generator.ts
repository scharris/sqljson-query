import {promises as fs} from 'fs'; // for some older node versions (e.g. v10)
import * as path from 'path';
import {makeArrayValuesMap} from './util/collections';
import {valueOr} from './util/nullability';
import {indentLines} from './util/strings';
import {DatabaseMetadata, RelMetadata} from './database-metadata';

export async function writeRelationsMetadataModule
  (
    dbmdFile: string,
    sourceOutputDir: string
  )
{
  const dbmdStoredPropsJson = await fs.readFile(dbmdFile, 'utf8');
  const dbmd = new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));

  const outputFile = path.join(sourceOutputDir, "relations-metadata.ts");

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