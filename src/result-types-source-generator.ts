import {promises as fs} from 'fs'; // for some older node versions (e.g. v10)
import * as path from 'path';
import {hashString, upperCamelCase, partitionByEquality, makeNameNotInSet, indentLines} from './util';
import {getQueryParamNames, QuerySpec, ResultRepr} from './query-specs';
import {
  ResultType, ChildCollectionProperty, TableFieldProperty, TableExpressionProperty,
  ParentReferenceProperty, propertiesCount, resultTypesEqual
} from './result-types';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {SourceGenerationOptions, SourceLanguage, CustomPropertyTypeFn} from './source-generation-options';
import {DatabaseMetadata} from './database-metadata';
import {ResultTypesGenerator} from './result-types-generator';

export class ResultTypesSourceGenerator
{
  readonly resultTypesGen: ResultTypesGenerator;

  constructor
    (
      dbmd: DatabaseMetadata,
      defaultSchema: string | null,
      defaultPropertyNameFn : (fieldName: string) => string
    )
  {
    this.resultTypesGen = new ResultTypesGenerator(dbmd, defaultSchema, defaultPropertyNameFn);
  }

  async makeQueryResultTypesSource
    (
      querySpec: QuerySpec,
      sqlPaths: QueryReprSqlPath[],
      fileName: string | null = null, // languages like Java constrain the exported type name to match the file name
      opts: SourceGenerationOptions = {}
    )
    : Promise<string>
  {
    const qName = querySpec.queryName;
    const qResTypes = this.resultTypesGen.generateResultTypes(querySpec.tableJson, qName);
    const qParams = getQueryParamNames(querySpec);
    const qTypesHdr = querySpec.typesFileHeader;
    const srcLang = opts.sourceLanguage || 'TS';

    switch (srcLang)
    {
      case 'TS':
        return await makeTypeScriptSource(qName, qResTypes, qTypesHdr, qParams, sqlPaths, opts);
      case 'Java':
        if ( fileName == null ) throw new Error('file name is required to generate Java result types source code.');
        return await makeJavaSource(qName, qResTypes, qTypesHdr, qParams, sqlPaths, fileName, opts);
      default: missingLang(srcLang);
    }
  }
} // ends class ResultTypesSourceGenerator

async function makeTypeScriptSource
  (
    queryName: string,
    resultTypes: ResultType[],
    queryTypesFileHeader: string | undefined,
    queryParamNames: string[],
    sqlPaths: QueryReprSqlPath[],
    opts: NonLangSrcGenOptions
  )
  : Promise<string>
{
  return (
    await generalTypesFileHeader(opts.typesHeaderFile) +
    (queryTypesFileHeader || '') + '\n\n' +
    '// The types defined in this file correspond to results of the following generated SQL queries.\n' +
    sqlFileReferences(queryName, sqlPaths, opts.sqlResourcePathPrefix, 'TS') + "\n\n" +
    '// query parameters\n' +
    queryParamDefinitions(queryParamNames, 'TS') + '\n\n' +
    '// Below are types representing the result data for the generated query, with top-level type first.\n' +
    resultTypeDeclarations(resultTypes, opts.customPropertyTypeFn, 'TS')
  );
}

async function makeJavaSource
  (
    queryName: string,
    resultTypes: ResultType[],
    queryTypesFileHeader: string | undefined,
    queryParamNames: string[],
    sqlPaths: QueryReprSqlPath[],
    fileName: string,
    opts: NonLangSrcGenOptions
  )
  : Promise<string>
{
  if ( !fileName.endsWith('.java') )
    throw new Error('Expected Java source file name to end with ".java"');

  const sqlPathMembers = sqlPaths.length == 0 ? '' :
    '  // The types defined in this file correspond to results of the following generated SQL queries.\n' +
    indentLines(sqlFileReferences(queryName, sqlPaths, opts.sqlResourcePathPrefix, 'Java'), 2) + '\n\n';
  const sqlParamMembers = queryParamNames.length == 0 ? '' :
    "  // query parameters\n" +
    indentLines(queryParamDefinitions(queryParamNames, 'Java'), 2) + '\n\n';

  return (
    await generalTypesFileHeader(opts.typesHeaderFile) +
    (queryTypesFileHeader || '') + '\n' +
    javaStandardImports + '\n\n' +
    `public class ${fileName.substring(0, fileName.lastIndexOf('.'))}\n` +
    '{\n' +
      sqlPathMembers +
      sqlParamMembers +
      "  // Below are types representing the result data for the generated query, with top-level result type first.\n\n" +
      indentLines(resultTypeDeclarations(resultTypes, opts.customPropertyTypeFn, 'Java'), 2) + '\n' +
    '}\n'
  );
}

async function generalTypesFileHeader(typesHeaderFile: string | undefined): Promise<string>
{
  if ( typesHeaderFile != null ) return await fs.readFile(typesHeaderFile, 'utf8') + "\n";
  else return '';
}

function sqlFileReferences
  (
    queryName: string,
    queryReprSqlPaths: QueryReprSqlPath[],
    sqlResourcePathPrefix: string | undefined,
    srcLang: SourceLanguage
  )
  : string
{
  const lines = [];
  const sqlPathsByRepr = makeQueryResultReprToSqlPathMap(queryName, queryReprSqlPaths);

  for ( const repr of Array.from(sqlPathsByRepr.keys()).sort() )
  {
    const memberName = 'sqlResource' + (sqlPathsByRepr.size == 1 ? '' : upperCamelCase(repr));
    const resourceName = (sqlResourcePathPrefix || '') + path.basename(sqlPathsByRepr.get(repr) || '');
    switch (srcLang)
    {
      case 'TS': lines.push(`export const ${memberName} = "${resourceName}";`); break;
      case 'Java': lines.push(`   public static final String ${memberName} = "${resourceName}";`); break;
    }
  }

  return lines.join('\n') + '\n';
}

function queryParamDefinitions(paramNames: string[], srcLang: SourceLanguage): string
{
  const makeParamDecl: (paramName: string) => string =
    srcLang == 'TS' ? (paramName: string) => `export const ${paramName}Param = '${paramName}';` :
    srcLang == 'Java' ? (paramName: string) => `   public static final String ${paramName}Param = \"${paramName}\";` :
      missingLang(srcLang)
  return paramNames.map(makeParamDecl).join('\n\n');
}

function resultTypeDeclarations
  (
    resultTypes: ResultType[],
    customPropTypeFn: CustomPropertyTypeFn | undefined,
    srcLang: SourceLanguage
  )
  : string
{
  if ( resultTypes.length === 0 ) return '';

  const typeDecls: string[] = [];
  const writtenTypeNames = new Set();

  const resultTypeNameAssignments: Map<ResultType,string> = assignResultTypeNames(resultTypes);

  const makeTypeDecl =
    srcLang === 'TS' ? tsResultTypeDeclaration :
    srcLang === 'Java' ? javaResultTypeDeclaration :
      missingLang(srcLang)

  for ( const resType of resultTypes )
  {
    const resTypeName = resultTypeNameAssignments.get(resType);
    if ( resTypeName == null )
      throw new Error(`Error: result type name not found for ${JSON.stringify(resType)}.`);

    if ( !writtenTypeNames.has(resTypeName) )
    {
      typeDecls.push(makeTypeDecl(resType, resultTypeNameAssignments, customPropTypeFn) + '\n');
      writtenTypeNames.add(resTypeName);
    }
  }

  return typeDecls.join('\n');
}

function tsResultTypeDeclaration
  (
    resType: ResultType,
    resTypeNameAssignments: Map<ResultType,string>,
    customPropTypeFn: CustomPropertyTypeFn | undefined
  )
  : string
{
  const lines: string[] = [];
  const resTypeName = resTypeNameAssignments.get(resType)!;

  lines.push(`export interface ${resTypeName}`);
  lines.push('{');
  resType.tableFieldProperties.forEach(f => lines.push('  ' +
    `${f.name}: ${tableFieldPropertyType(f, resType, customPropTypeFn, 'TS')};`
  ));
  resType.tableExpressionProperty.forEach(f => lines.push('  ' +
    `${f.name}: ${tableExpressionPropertyType(f)};`
  ));
  resType.parentReferenceProperties.forEach(f => lines.push('  ' +
    `${f.name}: ${parentReferencePropertyType(f, resTypeNameAssignments, 'TS')};`
  ));
  resType.childCollectionProperties.forEach(f => lines.push('  ' +
    `${f.name}: ${childCollectionPropertyType(f, resTypeNameAssignments, customPropTypeFn, 'TS')};`
  ));
  lines.push('}')

  return lines.join('\n');
}

function javaResultTypeDeclaration
  (
    resType: ResultType,
    resTypeNameAssignments: Map<ResultType,string>,
    customPropTypeFn: CustomPropertyTypeFn | undefined
  )
  : string
{
  const lines: string[] = [];
  const resTypeName = resTypeNameAssignments.get(resType)!;

  lines.push(`public static class ${resTypeName}`);
  lines.push('{');
  resType.tableFieldProperties.forEach(f => lines.push('  ' +
    `public ${tableFieldPropertyType(f, resType, customPropTypeFn, 'Java')} ${f.name};`
  ));
  resType.tableExpressionProperty.forEach(f => lines.push('  ' +
    `public ${tableExpressionPropertyType(f)} ${f.name};`
  ));
  resType.parentReferenceProperties.forEach(f => lines.push('  ' +
    `public ${parentReferencePropertyType(f, resTypeNameAssignments, 'Java')} ${f.name};`
  ));
  resType.childCollectionProperties.forEach(f => lines.push('  ' +
    `public ${childCollectionPropertyType(f, resTypeNameAssignments, customPropTypeFn, 'Java')} ${f.name};`
  ));
  lines.push('}')

  return lines.join('\n');
}

function tableFieldPropertyType
  (
    tfp: TableFieldProperty,
    inResType: ResultType,
    customPropTypeFn: CustomPropertyTypeFn | undefined,
    srcLang: SourceLanguage
  )
  : string
{
  if ( tfp.specifiedSourceCodeFieldType != null )
    return tfp.specifiedSourceCodeFieldType;

  const customizedType = customPropTypeFn && customPropTypeFn(tfp, inResType);
  if ( customizedType )
    return customizedType;

  const lcDbFieldType = tfp.databaseType.toLowerCase();

  switch (lcDbFieldType)
  {
    case 'number':
    case 'numeric':
    case 'decimal':
    case 'bigint':
    case 'int':
    case 'integer':
    case 'int4':
    case 'smallint':
    case 'int8':
      return generalNumericTableFieldPropertyType(tfp, srcLang);
    case 'float':
    case 'real':
    case 'double':
      return floatingNumericTableFieldPropertyType(tfp, srcLang);
    case 'varchar':
    case 'varchar2':
    case 'text':
    case 'longvarchar':
    case 'char':
    case 'clob':
    case 'date':
    case 'time':
    case 'timestamp':
    case 'timestamp with time zone':
    case 'timestamptz':
      return textTableFieldPropertyType(tfp, srcLang);
    case 'bit':
    case 'boolean':
      return booleanTableFieldPropertyType(tfp, srcLang);
    case 'json':
    case 'jsonb':
      return jsonTableFieldPropertyType(tfp, srcLang);
    default:
      if ( lcDbFieldType.startsWith('timestamp') )
        return textTableFieldPropertyType(tfp, srcLang);
      else throw new Error(`unsupported type for database field ${tfp.name} of type ${tfp.databaseType}`);
  }
}

function tableExpressionPropertyType(tep: TableExpressionProperty): string
{
  if (!tep.specifiedSourceCodeFieldType) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${tep.name}.`);
  return tep.specifiedSourceCodeFieldType;
}

function parentReferencePropertyType
  (
    f: ParentReferenceProperty,
    resTypeNames: Map<ResultType,string>,
    srcLang: SourceLanguage
  )
  : string
{
  const parentTypeName = resTypeNames.get(f.refResultType)!;
  return withNullability(f.nullable, parentTypeName, srcLang);
}

function childCollectionPropertyType
  (
    p: ChildCollectionProperty,
    resTypeNames: Map<ResultType,string>,
    customPropTypeFn: CustomPropertyTypeFn | undefined,
    srcLang: SourceLanguage
  )
  : string
{
  const collElType = p.elResultType.unwrapped ?
    getSolePropertyType(p.elResultType, resTypeNames, customPropTypeFn, srcLang)
    : resTypeNames.get(p.elResultType)!; // a regular (wrapped) child record is never nullable itself, by its nature

  switch (srcLang)
  {
    case 'TS': return withNullability(p.nullable, `${collElType}[]`, 'TS');
    case 'Java': return withNullability(p.nullable, `List<${collElType}>`, 'Java');
    default: missingLang(srcLang);
  }
}

function getSolePropertyType
  (
    resType: ResultType,
    resTypeNames: Map<ResultType,string>,
    customPropTypeFn: CustomPropertyTypeFn | undefined,
    srcLang: SourceLanguage
  )
  : string
{
  if (propertiesCount(resType) !== 1)
    throw new Error(`Expected single field when unwrapping result type ${JSON.stringify(resType)}.`);

  if (resType.tableFieldProperties.length === 1)
    return tableFieldPropertyType(resType.tableFieldProperties[0], resType, customPropTypeFn, srcLang);
  else if (resType.tableExpressionProperty.length === 1)
    return tableExpressionPropertyType(resType.tableExpressionProperty[0]);
  else if (resType.childCollectionProperties.length === 1)
    return childCollectionPropertyType(resType.childCollectionProperties[0], resTypeNames, customPropTypeFn, srcLang);
  else if (resType.parentReferenceProperties.length === 1)
    return parentReferencePropertyType(resType.parentReferenceProperties[0], resTypeNames, srcLang);
  else
    throw new Error(`Unhandled field category when unwrapping ${JSON.stringify(resType)}.`);
}

function generalNumericTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS':
      return withNullability(fp.nullable, 'number', 'TS');
    case 'Java':
      if ( fp.fractionalDigits == null || fp.fractionalDigits > 0 )
        return withNullability(fp.nullable, 'BigDecimal', 'Java');
      else // no fractional part
      {
        const primTypeName = fp.precision == null || fp.precision > 9 ? "long" : "int";
        return withNullability(fp.nullable, primTypeName, 'Java');
      }
    default: missingLang(srcLang);
  }
}

function floatingNumericTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'number', 'TS');
    case 'Java': return withNullability(fp.nullable, "double", 'Java');
    default: missingLang(srcLang);
  }
}

function textTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'string', 'TS');
    case 'Java': return withNullability(fp.nullable, "String", 'Java');
    default: missingLang(srcLang);
  }
}

function booleanTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'boolean', 'TS');
    case 'Java': return withNullability(fp.nullable, "boolean", 'Java');
    default: missingLang(srcLang);
  }
}

function jsonTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'any', 'TS');
    case 'Java': return withNullability(fp.nullable, 'JsonNode', 'Java');
    default: missingLang(srcLang);
  }
}

function withNullability
  (
    maybeNullable: boolean | null,
    typeName: string,
    srcLang: SourceLanguage
  )
  : string
{
  const nullable = maybeNullable == null ? true : maybeNullable;
  switch (srcLang)
  {
    case 'TS': return typeName + (nullable ? ' | null' : '');
    case 'Java':
      if (nullable) return '@Nullable ' + toJavaReferenceType(typeName);
      else return typeName;
    default: missingLang(srcLang);
  }
}

function toJavaReferenceType(typeName: string): string
{
  switch (typeName)
  {
    case 'int': return 'Integer';
    case 'long': return 'Long';
    case 'double': return 'Double';
    case 'boolean': return 'Boolean';
    case 'char': return 'Character';
    default: return typeName;
  }
}

function assignResultTypeNames(resTypes: ResultType[]): Map<ResultType,string>
{
  const rtHash = (rt: ResultType) => hashString(rt.table) +
    3 * rt.tableFieldProperties.length +
    17 * rt.parentReferenceProperties.length +
    27 * rt.childCollectionProperties.length;

  const m = new Map<ResultType,string>();
  const typeNames = new Set<string>();

  for (const eqGrp of partitionByEquality(resTypes, rtHash, resultTypesEqual) )
  {
    const typeName = makeNameNotInSet(upperCamelCase(eqGrp[0].table), typeNames, '_');
    for (const resType of eqGrp)
      m.set(resType, typeName);
    typeNames.add(typeName);
  }

  return m;
}

function makeQueryResultReprToSqlPathMap
  (
    queryName: string,
    queryReprPathsAllQueries: QueryReprSqlPath[]
  )
  : Map<ResultRepr, string>
{
  const res = new Map<ResultRepr, string>();
  for ( const qrp of queryReprPathsAllQueries )
  {
    if ( qrp.queryName === queryName )
    {
      if ( res.has(qrp.resultRepr) )
        throw new Error(`Duplicate query representation path encountered for query ${qrp.queryName}.`);

      res.set(qrp.resultRepr, qrp.sqlPath);
    }
  }
  return res;
}

const javaStandardImports: string =
  'import java.util.*;\n' +
  'import java.math.*;\n' +
  'import java.time.*;\n' +
  'import org.checkerframework.checker.nullness.qual.Nullable;\n' +
  'import org.checkerframework.checker.nullness.qual.NonNull;\n' +
  'import org.checkerframework.framework.qual.DefaultQualifier;\n' +
  'import org.checkerframework.framework.qual.TypeUseLocation;\n' +
  'import com.fasterxml.jackson.databind.JsonNode;\n' +
  'import com.fasterxml.jackson.databind.node.*;\n';

type NonLangSrcGenOptions = Omit<SourceGenerationOptions, 'sourceLanguage'>;

function missingLang(srcLang: never): never
{
  let _: never;
  console.log(_ = srcLang);
  return _;
}

