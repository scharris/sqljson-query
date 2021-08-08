import * as path from 'path';
import {makeArrayValuesMap, valueOr, indentLines, missingCase, readTextFile, writeTextFile} from './util/mod';
import {CaseSensitivity, DatabaseMetadata, RelMetadata} from './database-metadata';
import {SourceLanguage} from './source-generation-options';

export async function generateRelationsMetadataSource
  (
    dbmdFile: string,
    sourceOutputDir: string,
    srcLang: SourceLanguage,
    javaPackage: string | undefined = undefined,
    preferLowercaseNames: boolean = true
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
      return await writeTextFile(
        outputFile,
        autogenWarning + "\n\n" + relationsTSModuleSource(dbmd, preferLowercaseNames)
      );
    }
    case 'Java':
    {
      const fieldStructOutputFile = path.join(sourceOutputDir, 'Field.java');
      await writeTextFile(fieldStructOutputFile, fieldStructSource(javaPackage));

      const relMdsOutputFile = path.join(sourceOutputDir, 'RelationsMetadata.java');
      const header = autogenWarning + '\n' + (javaPackage ? `package ${javaPackage};\n\n` : '');
      return await writeTextFile(
        relMdsOutputFile,
        header + "\n\n" + relationsJavaSource(dbmd, preferLowercaseNames)
      );
    }
    default: return missingCase(srcLang);
  }
}

function relationsTSModuleSource(dbmd: DatabaseMetadata, preferLowercaseNames: boolean): string
{
  const parts: string[] = [];

  const schemaToRelMdsMap =
    makeArrayValuesMap(dbmd.relationMetadatas,
      relMd => valueOr(relMd.relationId.schema, "DEFAULT"),
      relMd => relMd
    );

  for ( const [schema, relMds] of schemaToRelMdsMap.entries() )
  {
    parts.push(`export const Schema_${ident(schema, dbmd.caseSensitivity, preferLowercaseNames)} = {\n`);

    for ( const relMd of relMds )
    {
      parts.push(indentLines(
        relationMetadataTSSource(relMd, dbmd.caseSensitivity, preferLowercaseNames),
        2
      ));
      parts.push("\n");
    }

    parts.push("};\n"); // close schema object
  }

  return parts.join('');
}

function relationsJavaSource(dbmd: DatabaseMetadata, preferLowercaseNames: boolean): string
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
    parts.push(`  public static class Schema_${ident(schema, dbmd.caseSensitivity, preferLowercaseNames)}`);
    parts.push('  {');

    for ( const relMd of relMds )
    {
      parts.push(indentLines(
        relationMetadataJavaSource(relMd, dbmd.caseSensitivity, preferLowercaseNames),
        4
      ));
    }

    parts.push("  }"); // schema class
  }

  parts.push("}"); // Relations class

  return parts.join('\n');
}

function relationMetadataTSSource
  (
    relMd: RelMetadata,
    dbCaseSensitivity: CaseSensitivity,
    preferLowercaseNames: boolean
  )
  : string
{
  const parts: string[] = [];

  const relName = ident(relMd.relationId.name, dbCaseSensitivity, preferLowercaseNames);
  parts.push(`"${relName}": { // relation ${relName}`);

  for ( const f of relMd.fields )
  {
    parts.push(
      `   ${lit(ident(f.name, dbCaseSensitivity, preferLowercaseNames))}: { ` +
      `type: ${lit(f.databaseType)}, ` +
      `nullable: ${f.nullable}, ` +
      `pkPart: ${f.primaryKeyPartNumber != null ? f.primaryKeyPartNumber.toString() : "null"}, ` +
      `len: ${f.length}, ` +
      `prec: ${f.precision}, ` +
      `precRadix: ${f.precisionRadix}, ` +
      `scale: ${f.fractionalDigits} },`
    );
  }

  parts.push("},\n");

  return parts.join('\n');
}

function relationMetadataJavaSource
  (
    relMd: RelMetadata,
    dbCaseSensitivity: CaseSensitivity,
    preferLowercaseNames: boolean
  )
  : string
{
  const parts: string[] = [];

  const relName = ident(relMd.relationId.name, dbCaseSensitivity, preferLowercaseNames);
  const relId = relMd.relationId.schema ?
    ident(relMd.relationId.schema, dbCaseSensitivity, preferLowercaseNames) + '.' + relName
    : relName;
  parts.push(`public static class ${relName} // relation`);
  parts.push('{');
  parts.push(`  public static String tableId() { return "${relId}"; }`);
  parts.push(`  public static String tableName() { return "${relName}"; }`);

  for ( const f of relMd.fields )
  {
    const pkPartNum = f.primaryKeyPartNumber;
    const fName = ident(f.name, dbCaseSensitivity, preferLowercaseNames);
    parts.push(
      `  public static final Field ${fName} = new Field(` +
      `${lit(fName)}, ${lit(f.databaseType)}, ${f.nullable}, ${pkPartNum?.toString() || "null"}, ` +
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
   public String toString() { return this.name; }
}
`
}

function ident
  (
    name: string,
    dbCaseSensitivity: CaseSensitivity,
    preferLowercaseNames: boolean
  )
  : string
{
  if ( preferLowercaseNames && dbCaseSensitivity === 'INSENSITIVE_STORED_UPPER' &&
       !name.startsWith('"') && name === name.toUpperCase() )
    return name.toLowerCase();
  else
    return name;
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

