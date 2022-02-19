import * as path from 'path';
import {hashString, upperCamelCase, partitionByEquality, makeNameNotInSet, indentLines, missingCase, readTextFile}
  from './util/mod';
import {getQueryParamNames, QuerySpec, ResultRepr} from './query-specs';
import {
  ResultType, ChildCollectionProperty, TableFieldProperty, TableExpressionProperty,
  ParentReferenceProperty, propertiesCount, resultTypesEqual
} from './result-types';
import {QueryReprSqlPath} from './query-repr-sql-path';
import {SourceGenerationOptions, SourceLanguage, JavaSourceGenerationOptions} from './source-generation-options';
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
      opts: SourceGenerationOptions = { sourceLanguage: 'TS' }
    )
    : Promise<string>
  {
    const qName = querySpec.queryName;
    const qResTypes = this.resultTypesGen.generateResultTypes(querySpec.tableJson, qName);
    const qParams = getQueryParamNames(querySpec);
    const qTypesHdr = querySpec.typesFileHeader;

    switch (opts.sourceLanguage)
    {
      case 'TS':
        return await makeTypeScriptSource(qName, qResTypes, qTypesHdr, qParams, sqlPaths, opts);
      case 'Java':
        if ( fileName == null ) throw new Error('file name is required to generate Java result types source code.');
        return await makeJavaSource(qName, qResTypes, qTypesHdr, qParams, sqlPaths, fileName, opts);
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
    opts: SourceGenerationOptions
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
    resultTypeDeclarations(resultTypes, opts)
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
    opts: SourceGenerationOptions & JavaSourceGenerationOptions,
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
    (opts.javaPackage ? `package ${opts.javaPackage};\n\n` : '') +
    await generalTypesFileHeader(opts.typesHeaderFile) +
    (queryTypesFileHeader || '') + '\n' +
    javaStandardImports + '\n\n' +
    `public class ${fileName.substring(0, fileName.lastIndexOf('.'))}\n` +
    '{\n' +
      sqlPathMembers +
      sqlParamMembers +
      "  // Below are types representing the result data for the generated query, with top-level result type first.\n\n" +
      indentLines(resultTypeDeclarations(resultTypes, opts), 2) + '\n' +
    '}\n'
  );
}

async function generalTypesFileHeader(typesHeaderFile: string | undefined): Promise<string>
{
  if ( typesHeaderFile != null ) return await readTextFile(typesHeaderFile) + "\n";
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
      case 'Java': lines.push(`public static final String ${memberName} = "${resourceName}";`); break;
    }
  }

  return lines.join('\n') + '\n';
}

function queryParamDefinitions(paramNames: string[], srcLang: SourceLanguage): string
{
  const makeParamDecl: (paramName: string) => string =
    srcLang == 'TS' ? (paramName: string) => `export const ${paramName}Param = '${paramName}';` :
    srcLang == 'Java' ? (paramName: string) => `public static final String ${paramName}Param = \"${paramName}\";` :
      missingCase(srcLang)
  return paramNames.map(makeParamDecl).join('\n\n');
}

function resultTypeDeclarations
  (
    resultTypes: ResultType[],
    opts: SourceGenerationOptions
  )
  : string
{
  if ( resultTypes.length === 0 ) return '';

  const typeDecls: string[] = [];
  const writtenTypeNames = new Set();

  const resultTypeNameAssignments: Map<ResultType,string> = assignResultTypeNames(resultTypes);

  const makeTypeDecl =
    opts.sourceLanguage === 'TS' ? makeTSResultTypeDeclaration : makeJavaResultTypeDeclaration;

  for ( const resType of resultTypes )
  {
    const resTypeName = resultTypeNameAssignments.get(resType);
    if ( resTypeName == null )
      throw new Error(`Error: result type name not found for ${JSON.stringify(resType)}.`);

    if ( !writtenTypeNames.has(resTypeName) )
    {
      typeDecls.push(makeTypeDecl(resType, resultTypeNameAssignments, opts) + '\n');
      writtenTypeNames.add(resTypeName);
    }
  }

  return typeDecls.join('\n');
}

function makeTSResultTypeDeclaration
  (
    resType: ResultType,
    resTypeNameAssignments: Map<ResultType,string>,
    opts: SourceGenerationOptions
  )
  : string
{
  const lines: string[] = [];
  const resTypeName = resTypeNameAssignments.get(resType)!;

  lines.push(`export interface ${resTypeName}`);
  lines.push('{');
  resType.tableFieldProperties.forEach(f => lines.push('  ' +
    `${f.name}: ${tableFieldPropertyType(f, resType, opts)};`
  ));
  resType.tableExpressionProperty.forEach(f => lines.push('  ' +
    `${f.name}: ${tableExpressionPropertyType(f, opts)};`
  ));
  resType.parentReferenceProperties.forEach(f => lines.push('  ' +
    `${f.name}: ${parentReferencePropertyType(f, resTypeNameAssignments, opts)};`
  ));
  resType.childCollectionProperties.forEach(f => lines.push('  ' +
    `${f.name}: ${childCollectionPropertyType(f, resTypeNameAssignments, opts)};`
  ));
  lines.push('}')

  return lines.join('\n');
}

function makeJavaResultTypeDeclaration
  (
    resType: ResultType,
    resTypeNameAssignments: Map<ResultType,string>,
    opts: SourceGenerationOptions
  )
  : string
{
  if ( opts.sourceLanguage !== 'Java' )
    throw new Error('Logic error: wrong source type found in options.');

  const emitRecords: boolean = opts.javaOptions.emitRecords ?? false;

  const vis = emitRecords ? '' : 'public ';

  const fieldDecls: string[] = [];
  resType.tableFieldProperties.forEach(f => {
    const fieldType = tableFieldPropertyType(f, resType, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });
  resType.tableExpressionProperty.forEach(f => {
    const fieldType = tableExpressionPropertyType(f, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });
  resType.parentReferenceProperties.forEach(f => {
    const fieldType = parentReferencePropertyType(f, resTypeNameAssignments, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });
  resType.childCollectionProperties.forEach(f => {
    const fieldType = childCollectionPropertyType(f, resTypeNameAssignments, opts);
    fieldDecls.push(`${vis}${fieldType} ${f.name}`);
  });

  const resTypeName = resTypeNameAssignments.get(resType)!;

  if ( emitRecords ) return (
    `public record ${resTypeName}(\n` +
      indentLines(fieldDecls.join(',\n'), 2) + '\n' +
    '){}'
  );
  else return (
    '@SuppressWarnings("nullness") // because fields will be set directly by the deserializer not by constructor\n' +
    `public static class ${resTypeName}\n` +
    '{\n' +
      indentLines(fieldDecls.join(';\n'), 2) + ';\n' +
    '}'
  );
}

function tableFieldPropertyType
  (
    tfp: TableFieldProperty,
    inResType: ResultType,
    opts: SourceGenerationOptions
  )
  : string
{
  if ( tfp.specifiedSourceCodeFieldType != null )
    return specifiedSourceCodeFieldType(tfp.specifiedSourceCodeFieldType, opts);

  const customizedType = opts.customPropertyTypeFn && opts.customPropertyTypeFn(tfp, inResType);
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
      return generalNumericTableFieldPropertyType(tfp, opts.sourceLanguage);
    case 'float':
    case 'real':
    case 'double':
      return floatingNumericTableFieldPropertyType(tfp, opts.sourceLanguage);
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
      return textTableFieldPropertyType(tfp, opts.sourceLanguage);
    case 'bit':
    case 'boolean':
    case 'bool':
      return booleanTableFieldPropertyType(tfp, opts.sourceLanguage);
    case 'json':
    case 'jsonb':
      return jsonTableFieldPropertyType(tfp, opts.sourceLanguage);
    default:
      if ( lcDbFieldType.startsWith('timestamp') )
        return textTableFieldPropertyType(tfp, opts.sourceLanguage);
      else throw new Error(`unsupported type for database field '${tfp.name}' of type '${tfp.databaseType}'`);
  }
}

function tableExpressionPropertyType
  (
    tep: TableExpressionProperty,
    opts: SourceGenerationOptions
  )
  : string
{
  if (!tep.specifiedSourceCodeFieldType) // This should have been caught in validation.
    throw new Error(`Generated field type is required for table expression property ${tep.name}.`);

  return specifiedSourceCodeFieldType(tep.specifiedSourceCodeFieldType, opts);
}

function specifiedSourceCodeFieldType
  (
    specSourceCodeFieldType: string | {[srcLang: string]: string},
    opts: SourceGenerationOptions
  )
  : string
{
  switch (typeof specSourceCodeFieldType)
  {
    case 'string':
      return specSourceCodeFieldType;
    default:
      if ( !(opts.sourceLanguage in specSourceCodeFieldType) ) throw new Error(
        `Expression type for language ${opts.sourceLanguage} not specified for table expression property ${specSourceCodeFieldType}.`
      );
      return specSourceCodeFieldType[opts.sourceLanguage];
  }
}

function parentReferencePropertyType
  (
    f: ParentReferenceProperty,
    resTypeNames: Map<ResultType,string>,
    opts: SourceGenerationOptions
  )
  : string
{
  const parentTypeName = resTypeNames.get(f.refResultType)!;
  return withNullability(f.nullable, parentTypeName, opts.sourceLanguage);
}

function childCollectionPropertyType
  (
    p: ChildCollectionProperty,
    resTypeNames: Map<ResultType,string>,
    opts: SourceGenerationOptions
  )
  : string
{
  const collElType = p.elResultType.unwrapped ?
    getSolePropertyType(p.elResultType, resTypeNames, opts)
    : resTypeNames.get(p.elResultType)!; // a regular (wrapped) child record is never nullable itself, by its nature

  switch (opts.sourceLanguage)
  {
    case 'TS': return withNullability(p.nullable, `${collElType}[]`, 'TS');
    case 'Java':
      return withNullability(p.nullable, `List<${toJavaReferenceType(collElType)}>`, 'Java');
  }
}

function getSolePropertyType
  (
    resType: ResultType,
    resTypeNames: Map<ResultType,string>,
    opts: SourceGenerationOptions
  )
  : string
{
  if (propertiesCount(resType) !== 1)
    throw new Error(`Expected single field when unwrapping result type ${JSON.stringify(resType)}.`);

  if (resType.tableFieldProperties.length === 1)
    return tableFieldPropertyType(resType.tableFieldProperties[0], resType, opts);
  else if (resType.tableExpressionProperty.length === 1)
    return tableExpressionPropertyType(resType.tableExpressionProperty[0], opts);
  else if (resType.childCollectionProperties.length === 1)
    return childCollectionPropertyType(resType.childCollectionProperties[0], resTypeNames, opts);
  else if (resType.parentReferenceProperties.length === 1)
    return parentReferencePropertyType(resType.parentReferenceProperties[0], resTypeNames, opts);
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
    default: return missingCase(srcLang);
  }
}

function floatingNumericTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'number', 'TS');
    case 'Java': return withNullability(fp.nullable, "double", 'Java');
    default: return missingCase(srcLang);
  }
}

function textTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'string', 'TS');
    case 'Java': return withNullability(fp.nullable, "String", 'Java');
    default: return missingCase(srcLang);
  }
}

function booleanTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'boolean', 'TS');
    case 'Java': return withNullability(fp.nullable, "boolean", 'Java');
    default: return missingCase(srcLang);
  }
}

function jsonTableFieldPropertyType(fp: TableFieldProperty, srcLang: SourceLanguage): string
{
  switch (srcLang)
  {
    case 'TS': return withNullability(fp.nullable, 'any', 'TS');
    case 'Java': return withNullability(fp.nullable, 'JsonNode', 'Java');
    default: return missingCase(srcLang);
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
    default: return missingCase(srcLang);
  }
}

function toJavaReferenceType(typeName: string): string
{
  switch (typeName)
  {
    case 'int': return 'Integer';
    case 'long': return 'Long';
    case 'double': return 'Double';
    case 'float': return 'Float';
    case 'boolean': return 'Boolean';
    case 'char': return 'Character';
    case 'short': return 'Short';
    case 'byte': return 'Byte';
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
