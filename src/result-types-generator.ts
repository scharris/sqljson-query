import {caseNormalizeName, makeMap} from './util/index.ts';
import {DatabaseMetadata, Field, foreignKeyFieldNames, RelId, relIdString, toRelId} from './database-metadata.ts';
import {
  ResultType, ChildCollectionProperty, TableFieldProperty, TableExpressionProperty,
  ParentReferenceProperty, propertiesCount
} from './result-types.ts';
import {
  ChildSpec, getInlineParentSpecs, getReferencedParentSpecs, ParentSpec, ReferencedParentSpec,
  TableFieldExpr, TableJsonSpec
} from './query-specs.ts';

export class ResultTypesGenerator
{
  constructor
  (
    private readonly dbmd: DatabaseMetadata,
    private readonly defaultSchema: string | null,
    private readonly defaultPropertyNameFn : (fieldName: string) => string
  )
  {}

  /// Generates result type structures for the top table and all parent and child tables
  /// which are included transitively in the passed table json specification. No attempt
  /// is made to remove duplicate result type structures.
  public generateResultTypes
    (
      tjs: TableJsonSpec,
      queryName: string
    )
    : ResultType[]
  {
    const typeBuilder = new ResultTypeBuilder(queryName);
    const resultTypes: ResultType[] = [];

    const relId = toRelId(tjs.table, this.defaultSchema, this.dbmd.caseSensitivity);
    const dbFieldsByName: Map<string,Field> = this.getTableFieldsByName(relId);

    // Add the table's own fields and expressions involving those fields.
    typeBuilder.addTableFieldProperties(this.getTableFieldProperties(relId, tjs.fieldExpressions, dbFieldsByName));
    typeBuilder.addTableExpressionProperties(getTableExpressionProperties(relId, tjs.fieldExpressions));

    // Inline parents can contribute fields to any primary field category (table field,
    // expression, parent ref, child collection). Get the inline parent fields, and the result
    // types from the tables themselves and recursively from their specified related tables.
    const inlineParentSpecs = getInlineParentSpecs(tjs);
    if ( inlineParentSpecs.length > 0 )
    {
      const inlineParentsContr = this.getInlineParentContrs(relId, inlineParentSpecs, queryName);
      typeBuilder.addFieldsFromTypeBuilder(inlineParentsContr.typeBuilder);
      resultTypes.push(...inlineParentsContr.resultTypes);
    }

    // Get referenced parent fields and result types, with result types from related tables.
    const refdParentSpecs = getReferencedParentSpecs(tjs);
    if ( refdParentSpecs.length > 0 )
    {
      const refdParentsContr = this.getReferencedParentContrs(relId, refdParentSpecs, queryName);
      typeBuilder.addParentReferenceProperties(refdParentsContr.parentReferenceProperties);
      resultTypes.push(...refdParentsContr.resultTypes);
    }

    // Get the child collection fields and result types, with result types from related tables.
    if ( tjs.childTables )
    {
      const childCollsContr = this.getChildCollectionContrs(tjs.childTables, queryName);
      typeBuilder.addChildCollectionProperties(childCollsContr.childCollectionProperties);
      resultTypes.push(...childCollsContr.resultTypes);
    }

    // The top table's type must be added at leading position in the returned list, followed
    // by any other supporting types that were generated.
    resultTypes.splice(0, 0, typeBuilder.build(tjs.table));

    return resultTypes;
  }

  private getTableFieldProperties
    (
      relId: RelId,
      tableFieldExpressions: (string | TableFieldExpr)[] | undefined,
      dbFieldsByName: Map<string,Field>
    )
    : TableFieldProperty[]
  {
    if ( !tableFieldExpressions ) return [];

    const fields: TableFieldProperty[] = [];

    for ( const tfe of tableFieldExpressions )
    {
      const fieldName = getFieldName(tfe);

      if ( fieldName != null )
      {
        const dbField = dbFieldsByName.get(caseNormalizeName(fieldName, this.dbmd.caseSensitivity));
        if ( dbField == undefined )
          throw new Error(`No metadata found for field ${relIdString(relId)}.${fieldName}.`);
        fields.push(this.makeTableFieldProperty(tfe, dbField));
      }
    }

    return fields;
  }

  /// Get the inline parent contributions of properties and result types for the type to be generated.
  private getInlineParentContrs
    (
      relId: RelId,
      parentSpecs: ParentSpec[],
      queryName: string
    )
    : InlineParentContrs
  {
    const typeBuilder = new ResultTypeBuilder(queryName);
    const resultTypes: ResultType[] = [];

    for ( const parentSpec of parentSpecs )
    {
      // Generate types for the parent table and any related tables it includes recursively.
      const parentResultTypes = this.generateResultTypes(parentSpec.tableJson, queryName);
      const parentType = parentResultTypes[0]; // will not be generated

      // If the parent record might be absent, then all inline fields must be nullable.
      const nullable = parentSpec.tableJson.recordCondition != undefined || !this.someFkFieldNullableFalse(parentSpec, relId);

      typeBuilder.addFieldsFromResultType(parentType, nullable);
      resultTypes.push(...parentResultTypes.slice(1));
    }

    return { typeBuilder, resultTypes };
  }

  /// Get fields and types from the given referenced parents.
  private getReferencedParentContrs
    (
      relId: RelId,
      refdParentSpecs: ReferencedParentSpec[],
      queryName: string
    )
    : RefdParentContrs
  {
    const parentReferenceProperties: ParentReferenceProperty[] = [];
    const resultTypes: ResultType[] = [];

    for ( const parentSpec of refdParentSpecs )
    {
      // Generate types for the parent table and any related tables it includes recursively.
      const parentResultTypes = this.generateResultTypes(parentSpec.tableJson, queryName);
      const resultType = parentResultTypes[0]; // parent object type

      // If the parent record might be absent, then all inline fields must be nullable.
      const nullable = !!parentSpec.tableJson.recordCondition || !this.someFkFieldNullableFalse(parentSpec, relId);

      parentReferenceProperties.push({ name: parentSpec.referenceName, refResultType: resultType, nullable });
      resultTypes.push(...parentResultTypes);
    }

    return { parentReferenceProperties, resultTypes };
  }

  private getChildCollectionContrs
    (
      childSpecs: ChildSpec[],
      queryName: string
    )
    : ChildCollectionContrs
  {
    const childCollectionProperties: ChildCollectionProperty[]  = [];
    const resultTypes: ResultType[] = [];

    for ( const childCollSpec of childSpecs )
    {
      // Generate types for the child table and any related tables it includes recursively.
      const childResultTypes = this.generateResultTypes(childCollSpec.tableJson, queryName);
      const elType = childResultTypes[0];

      // Mark the child collection element type as unwrapped if specified.
      if ( childCollSpec.unwrap )
      {
        if ( propertiesCount(elType) !== 1 )
          throw new Error("Unwrapped child collection elements must have exactly one property.");
        resultTypes.push(...childResultTypes.slice(1)); // unwrapped types are not added to result types list
      }
      else
        resultTypes.push(...childResultTypes);

      childCollectionProperties.push({
        name: childCollSpec.collectionName,
        elResultType: childCollSpec.unwrap ? {...elType, unwrapped: true} : elType,
        nullable: false
      });
    }

    return { childCollectionProperties, resultTypes };
  }

  private makeTableFieldProperty
    (
      tfe: string | TableFieldExpr,
      dbField: Field
    )
    : TableFieldProperty
  {
    return {
      name: this.getOutputFieldName(tfe, dbField),
      databaseFieldName: dbField.name,
      databaseType: dbField.databaseType,
      length: dbField.length || null,
      precision: dbField.precision || null,
      fractionalDigits: dbField.fractionalDigits || null,
      nullable: dbField.nullable != undefined ? dbField.nullable : null,
      specifiedSourceCodeFieldType: typeof tfe === 'string' ? null : tfe.fieldTypeInGeneratedSource || null
    };
  }

  private getOutputFieldName
    (
      tfe: string | TableFieldExpr,
      dbField: Field
    )
    : string
  {
    const specdJsonProp = typeof tfe === 'object' ? tfe.jsonProperty || null : null;
    return specdJsonProp || this.defaultPropertyNameFn(dbField.name);
  }

  private getTableFieldsByName (relId: RelId): Map<string,Field>
  {
    const relMd = this.dbmd.getRelationMetadata(relId);
    if ( relMd == null ) throw new Error(`Metadata for table ${relIdString(relId)} not found.`);

    return makeMap(relMd.fields, f => f.name, f => f);
  }

  private someFkFieldNullableFalse
    (
      parentSpec: ParentSpec,
      childRelId: RelId
    )
    : boolean
  {
    const parentRelId = toRelId(parentSpec.tableJson.table, this.defaultSchema, this.dbmd.caseSensitivity);
    const specFkFields = parentSpec.viaForeignKeyFields && new Set(parentSpec.viaForeignKeyFields) || null;
    const fk = this.dbmd.getForeignKeyFromTo(childRelId, parentRelId, specFkFields);
    if ( !fk ) throw new Error(`Foreign key from ${relIdString(childRelId)} to parent ${relIdString(parentRelId)} not found.`);

    const childFieldsByName = this.getTableFieldsByName(childRelId);

    for ( const fkFieldName of foreignKeyFieldNames(fk) )
    {
      const fkField = childFieldsByName.get(fkFieldName);
      if ( !fkField ) throw new Error(`Field not found for fk field ${fkFieldName} of table ${relIdString(childRelId)}.`);
      if ( fkField.nullable != null && !fkField.nullable ) return true;
    }

    return false;
  }
}

/// Holds result properties (in the type builder) and types contributed from inline parent tables.
interface InlineParentContrs
{
  typeBuilder: ResultTypeBuilder;
  resultTypes: ResultType[];
}
/// Holds result properties and types contributed from referenced parent tables.
interface RefdParentContrs
{
  parentReferenceProperties: ParentReferenceProperty[];
  resultTypes: ResultType[];
}
/// Holds result properties and types contributed from child tables.
interface ChildCollectionContrs
{
  childCollectionProperties: ChildCollectionProperty[];
  resultTypes: ResultType[];
}

class ResultTypeBuilder
{
  constructor
    (
      private readonly queryName: string,
      private readonly tableFieldProperties: TableFieldProperty[] = [],
      private readonly tableExpressionProperties: TableExpressionProperty[] = [],
      private readonly parentReferenceProperties: ParentReferenceProperty[] = [],
      private readonly childCollectionProperties: ChildCollectionProperty[] = []
    )
  {}

  addTableFieldProperties(fs: TableFieldProperty[])
  {
    fs.forEach(f => this.tableFieldProperties.push(f));
  }

  addTableExpressionProperties(fs: TableExpressionProperty[])
  {
    fs.forEach(f => this.tableExpressionProperties.push(f));
  }

  addParentReferenceProperties(fs: ParentReferenceProperty[])
  {
    fs.forEach(f => this.parentReferenceProperties.push(f));
  }

  addChildCollectionProperties(fs: ChildCollectionProperty[])
  {
    fs.forEach(f => this.childCollectionProperties.push(f));
  }

  addFieldsFromResultType
    (
      resultType: ResultType,
      forceNullable: boolean
    )
  {
    if ( forceNullable )
    {
      // Add nullable form of each field, as considered prior to any field
      // type overrides which are applied elsewhere (writing stage).
      // Expression fields are already nullable so need no transformation.
      this.addTableFieldProperties(resultType.tableFieldProperties.map(toNullableField));
      this.addTableExpressionProperties(resultType.tableExpressionProperty);
      this.addParentReferenceProperties(resultType.parentReferenceProperties.map(toNullableField));
      this.addChildCollectionProperties(resultType.childCollectionProperties.map(toNullableField));
    }
    else
    {
      this.addTableFieldProperties(resultType.tableFieldProperties);
      this.addTableExpressionProperties(resultType.tableExpressionProperty);
      this.addParentReferenceProperties(resultType.parentReferenceProperties);
      this.addChildCollectionProperties(resultType.childCollectionProperties);
    }
  }

  addFieldsFromTypeBuilder(resultTypeBuilder: ResultTypeBuilder)
  {
    this.addTableFieldProperties(resultTypeBuilder.tableFieldProperties);
    this.addTableExpressionProperties(resultTypeBuilder.tableExpressionProperties);
    this.addParentReferenceProperties(resultTypeBuilder.parentReferenceProperties);
    this.addChildCollectionProperties(resultTypeBuilder.childCollectionProperties);
  }

  build
    (
      table: string
    )
    : ResultType
  {
    return {
      queryName: this.queryName,
      table,
      tableFieldProperties: this.tableFieldProperties,
      tableExpressionProperty: this.tableExpressionProperties,
      parentReferenceProperties: this.parentReferenceProperties,
      childCollectionProperties: this.childCollectionProperties,
      unwrapped: false
    };
  }
}

function getTableExpressionProperties
  (
    relId: RelId,
    tableFieldExpressions: (string | TableFieldExpr)[] | undefined
  )
  : TableExpressionProperty[]
{
  if ( !tableFieldExpressions ) return [];

  const fields: TableExpressionProperty[]  = [];

  for ( const tfe of tableFieldExpressions )
  {
    if ( typeof tfe !== 'string' && tfe.expression != null )
    {
      const jsonProperty = tfe.jsonProperty;
      if ( jsonProperty == null )
        throw new Error(`Expression field ${relIdString(relId)}.${tfe.expression} requires a json property.`)

      fields.push({
        name: jsonProperty,
        fieldExpression: tfe.expression,
        specifiedSourceCodeFieldType: tfe.fieldTypeInGeneratedSource || null
      });
    }
  }

  return fields;
}

/// Return nullable variant of a database field, for any of the above field types
/// having a "nullable" property.
function toNullableField<T extends {nullable: boolean|null}>(f: T): T
{
  return (f.nullable != null && f.nullable) ? f : {...f, nullable: true};
}

function getFieldName(tfe: string | TableFieldExpr): string | null
{
  return typeof tfe === 'string' ? <string>tfe : tfe.field != null ? tfe.field : null;
}
