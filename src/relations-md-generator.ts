import {promises as fs} from 'fs'; // for some older node versions (e.g. v10)
import * as path from 'path';
import {makeArrayValuesMap, valueOr, indentLines, missingCase} from './util';
import {DatabaseMetadata, RelMetadata} from './database-metadata';
import {SourceLanguage} from './source-generation-options';

export async function generateRelationsMetadataSource
  (
    dbmdFile: string,
    sourceOutputDir: string,
    srcLang: SourceLanguage,
    javaPackage: string | undefined = undefined
  )
  : Promise<void>
{
  const dbmdStoredPropsJson = await fs.readFile(dbmdFile, 'utf8');
  const dbmd = new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));

  switch (srcLang)
  {
    case 'TS':
    {
      const outputFile = path.join(sourceOutputDir, 'relations-metadata.ts');
      return await fs.writeFile(outputFile, autogenWarning + "\n\n" + relationsTSModuleSource(dbmd));
    }
    case 'Java':
    {
      await fs.writeFile(path.join(sourceOutputDir, 'Field.java'), fieldStructSource(javaPackage));
      const relMdsOutputFile = path.join(sourceOutputDir, 'RelationsMetadata.java');
      const header = autogenWarning + '\n' + (javaPackage ? `package ${javaPackage};\n\n` : '');
      return await fs.writeFile(relMdsOutputFile, header + "\n\n" + relationsJavaSource(dbmd));
    }
    default: missingCase(srcLang);
  }
}

function relationsTSModuleSource(dbmd: DatabaseMetadata): string
{
  const parts: string[] = [];

  const schemaToRelMdsMap =
    makeArrayValuesMap(dbmd.relationMetadatas,
      relMd => valueOr(relMd.relationId.schema, "DEFAULT"),
      relMd => relMd
    );

  for ( const [schema, relMds] of schemaToRelMdsMap.entries() )
  {
    parts.push(`export const ${schema} = { // schema '${schema}'\n\n`);

    for ( const relMd of relMds )
    {
      parts.push(indentLines(relationMetadataTSSource(relMd), 2));
      parts.push("\n");
    }

    parts.push("};\n"); // close schema object
  }

  return parts.join('');
}

function relationsJavaSource(dbmd: DatabaseMetadata): string
{
  const parts: string[] = [];

  const schemaToRelMdsMap =
    makeArrayValuesMap(dbmd.relationMetadatas,
      relMd => valueOr(relMd.relationId.schema, "DEFAULT"),
      relMd => relMd
    );

  parts.push('public class RelationsMetadata');
  parts.push('{');

  for ( const [schema, relMds] of schemaToRelMdsMap.entries() )
  {
    parts.push(`  public static class ${schema} // schema '${schema}'`);
    parts.push('  {');

    for ( const relMd of relMds )
    {
      parts.push(indentLines(relationMetadataJavaSource(relMd), 4));
    }

    parts.push("  }"); // schema class
  }

  parts.push("}"); // Relations class

  return parts.join('\n');
}

function relationMetadataTSSource(relMd: RelMetadata): string
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

  return parts.join('\n');
}

function relationMetadataJavaSource(relMd: RelMetadata): string
{
  const parts: string[] = [];

  const relName = relMd.relationId.name;
  const relId = relMd.relationId.schema ? relMd.relationId.schema + '.' + relName : relName;
  parts.push(`public static class ${relName} // relation`);
  parts.push('{');
  parts.push(`  public static String id() { return "${relId}"; }`);

  for ( const f of relMd.fields )
  {
    const pkPartNum = f.primaryKeyPartNumber;
    parts.push(
      `  public static final Field ${f.name} = new Field(` +
      `${lit(f.name)}, ${lit(f.databaseType)}, ${f.nullable}, ${pkPartNum?.toString() || "null"}, ` +
      `${f.length}, ${f.precision}, ${f.precisionRadix}, ${f.fractionalDigits});`
    );
  }

  parts.push("}\n");

  return parts.join('\n');
}

function fieldStructSource(javaPackage: string | undefined): string
{
  return (javaPackage ? `package ${javaPackage};\n` : '') + `
import org.checkerframework.checker.nullness.qual.Nullable;

public class Field
{
   public String name;
   public String databaseType;
   public @Nullable Boolean nullable;
   public @Nullable Integer primaryKeyPartNumber;
   public @Nullable Integer length;
   public @Nullable Integer precision;
   public @Nullable Integer precisionRadix;
   public @Nullable Integer fractionalDigits;
   
   public Field
      (
         String name,
         String databaseType,
         @Nullable Boolean nullable,
         @Nullable Integer primaryKeyPartNumber,
         @Nullable Integer length,
         @Nullable Integer precision,
         @Nullable Integer precisionRadix,
         @Nullable Integer fractionalDigits
      )
   {
      this.name = name;
      this.databaseType = databaseType;
      this.nullable = nullable;
      this.primaryKeyPartNumber = primaryKeyPartNumber;
      this.length = length;
      this.precision = precision;
      this.precisionRadix = precisionRadix;
      this.fractionalDigits = fractionalDigits;
   }

}
`
}

function lit(s: string)
{
  return "\"" + s.replace(/"/g, '\\"') + "\"";
}

const autogenWarning =
  "// ---------------------------------------------------------------------------\n" +
  "//   THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST.  \n" +
  "// ---------------------------------------------------------------------------\n";

