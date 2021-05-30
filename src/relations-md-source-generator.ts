import {path} from './deps.ts';
import {makeArrayValuesMap, valueOr, indentLines, missingCase, readTextFile, writeTextFile} from './util/mod.ts';
import {DatabaseMetadata, RelMetadata} from './database-metadata.ts';
import {SourceLanguage} from './source-generation-options.ts';

export async function generateRelationsMetadataSource
  (
    dbmdFile: string,
    sourceOutputDir: string,
    srcLang: SourceLanguage,
    javaPackage: string | undefined = undefined
  )
  : Promise<void>
{
  const dbmdStoredPropsJson = await readTextFile(dbmdFile);
  const dbmd = new DatabaseMetadata(JSON.parse(dbmdStoredPropsJson));

  switch (srcLang)
  {
    case 'TS':
    {
      const outputFile = path.join(sourceOutputDir, 'relations-metadata.ts');
      return await writeTextFile(outputFile, autogenWarning + "\n\n" + relationsTSModuleSource(dbmd));
    }
    case 'Java':
    {
      const fieldStructOutputFile = path.join(sourceOutputDir, 'Field.java');
      await writeTextFile(fieldStructOutputFile, fieldStructSource(javaPackage));

      const relMdsOutputFile = path.join(sourceOutputDir, 'RelationsMetadata.java');
      const header = autogenWarning + '\n' + (javaPackage ? `package ${javaPackage};\n\n` : '');
      return await writeTextFile(relMdsOutputFile, header + "\n\n" + relationsJavaSource(dbmd));
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
    parts.push(
      `   ${lit(f.name)}: { ` +
      `type: ${lit(f.databaseType)}, ` +
      `nullable: ${f.nullable}, ` +
      `pkPart: ${f.primaryKeyPartNumber != null ? f.primaryKeyPartNumber.toString() : "null"}, ` +
      `len: ${f.length}, ` +
      `prec: ${f.precision}, ` +
      `precRadix: ${f.precisionRadix}, ` +
      `scale: ${f.fractionalDigits} },\n`
    );
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
`// ---------------------------------------------------------------------------
//   THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST.
// ---------------------------------------------------------------------------
`;

