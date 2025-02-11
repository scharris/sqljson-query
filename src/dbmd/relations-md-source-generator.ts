import * as path from 'path';
import {escapeDoubleQuotes, indentLines, makeArrayValuesMap, missingCase, Nullable} from '../util/mod';
import {readTextFile, writeTextFile} from '../util/files';
import {CaseSensitivity, DatabaseMetadata, RelMetadata} from './database-metadata';
import {SourceLanguage} from '../source-generation-options';

export async function generateRelationsMetadataSource
  (
    dbmdFile: string,
    sourceOutputDir: string,
    outputFileNameNoExt: string,
    srcLang: SourceLanguage,
    javaPackage: Nullable<string> = undefined,
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
      const outputFile = path.join(sourceOutputDir, `${outputFileNameNoExt}.ts`);
      return await writeTextFile(
        outputFile,
        autogenWarning + "\n\n" + relationsTSModuleSource(dbmd, preferLowercaseNames),
        { avoidWritingSameContents: true }
      );
    }
    case 'Java':
    {
      const relsMdOutputFile = path.join(sourceOutputDir, `${outputFileNameNoExt}.java`);
      const header = autogenWarning + '\n' + (javaPackage ? `package ${javaPackage};\n\n` : '');
      return await writeTextFile(
        relsMdOutputFile,
        header + "\n\n" + relationsJavaSource(dbmd, outputFileNameNoExt, preferLowercaseNames),
        { avoidWritingSameContents: true }
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
      relMd => relMd.relationId.schema ?? "DEFAULT",
      relMd => relMd
    );

  for ( const [schema, relMds] of schemaToRelMdsMap.entries() )
  {
    parts.push(`export const Schema_${ident(schema, dbmd.caseSensitivity, preferLowercaseNames)} = {\n`);

    for (const relMd of relMds)
    {
      parts.push(indentLines(
        relationMetadataTSSource(relMd, dbmd.caseSensitivity, preferLowercaseNames),
        2
      ));
      parts.push("\n");
    }

    parts.push("};\n"); // close schema object
  }

  parts.push(tsRelsMdModuleAuxFunctions);

  return parts.join('');
}

function relationsJavaSource
  (
    dbmd: DatabaseMetadata,
    outputFileNameNoExt: string,
    preferLowercaseNames: boolean
  )
  : string
{
  const parts: string[] = [];

  const schemaToRelMdsMap =
    makeArrayValuesMap(dbmd.relationMetadatas,
      relMd => relMd.relationId.schema ?? "DEFAULT",
      relMd => relMd
    );

  parts.push('import org.checkerframework.checker.nullness.qual.Nullable;\n');

  parts.push(`public class ${outputFileNameNoExt}`);
  parts.push('{');

  for ( const [schema, relMds] of schemaToRelMdsMap.entries() )
  {
    const schemaIdent = ident(schema, dbmd.caseSensitivity, preferLowercaseNames);

    parts.push(`  public static class Schema_${schemaIdent}`);
    parts.push('  {');

    for (const relMd of relMds)
    {
      parts.push(indentLines(
        relationMetadataJavaSource(relMd, dbmd.caseSensitivity, preferLowercaseNames),
        4
      ));
    }

    parts.push("\n    //////////////// Table names ////////////////");
    parts.push("    public static class TableNames {");
    for (const relMd of relMds)
    {
      const relName = ident(relMd.relationId.name, dbmd.caseSensitivity, preferLowercaseNames);
      parts.push(
        `      public static final String ${relNameJavaIdentifier(relName)} = "${escapeDoubleQuotes(relName)}";`,
      );
    }
    parts.push("    }\n\n");

    parts.push(`  } // ends schema ${schemaIdent}`);
  }

  parts.push(indentLines(fieldStructSource(), 2));

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

  for (const f of relMd.fields)
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
  parts.push(`public static class ${relJavaClassName(relName)} // relation`);
  parts.push('{');
  parts.push(`  public static String tableId() { return "${relId}"; }`);
  parts.push(`  public static String tableName() { return "${relName}"; }`);

  for (const f of relMd.fields)
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

function fieldStructSource(): string
{
  return `
public static class Field
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

function lit(s: string|null|undefined)
{
  if (!s) return '""';
  return "\"" + s.replace(/"/g, '\\"') + "\"";
}

function relNameJavaIdentifier(relName: string): string
{
  return relJavaClassName(relName);
}

function relJavaClassName(relName: string)
{
  switch(relName)
  {
    case 'abstract':
    case 'continue':
    case 'for':
    case 'new':
    case 'switch':
    case 'assert':
    case 'default':
    case 'goto':
    case 'package':
    case 'synchronized':
    case 'boolean':
    case 'do':
    case 'if':
    case 'private':
    case 'this':
    case 'break':
    case 'double:':
    case 'implements':
    case 'protected':
    case 'throw':
    case 'byte':
    case 'else':
    case 'import':
    case 'public':
    case 'throws':
    case 'case':
    case 'enum':
    case 'instanceof':
    case 'return':
    case 'transient':
    case 'catch':
    case 'extends':
    case 'int':
    case 'short':
    case 'try':
    case 'char':
    case 'final':
    case 'interface':
    case 'static':
    case 'void':
    case 'class':
    case 'finally':
    case 'long':
    case 'strictfp':
    case 'volatile':
    case 'const':
    case 'float':
    case 'native':
    case 'super':
    case 'while':
      return relName + "_";
    default:
      return relName;
  }
}

const autogenWarning =
`// ---------------------------------------------------------------------------
//   THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST.
// ---------------------------------------------------------------------------
`;

// Auxiliary functions for the TS rel mds module.
const tsRelsMdModuleAuxFunctions =  `
export function verifiedFieldNames<T extends Object>(relMd: T): { [P in keyof T]: string }
{
   const res: any = {};
   for ( const fieldName of Object.keys(relMd) )
      res[fieldName] = fieldName;
   return res;
}

export function verifiedTableName<T extends Object>(schemaMd: T, tableName: string & keyof T): (string & keyof T)
{
   return tableName;
}
`;
