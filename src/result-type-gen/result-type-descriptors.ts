import {caseNormalizeName, makeMap, relIdDescn, deepEquals} from '../util/mod';
import {DatabaseMetadata, Field, foreignKeyFieldNames, RelId} from '../dbmd';
import {
  ChildSpec, getInlineParentSpecs, getReferencedParentSpecs, ParentSpec, ReferencedParentSpec,
  TableFieldExpr, TableJsonSpec
} from '../query-specs';
import { identifyTable } from '../query-specs';


export interface ResultTypeDescriptor extends Properties
{
  readonly queryName: string;
  readonly table: string;
  readonly unwrapped: boolean;
}

interface Properties
{
  readonly tableFieldProperties: TableFieldProperty[];
  readonly tableExpressionProperties: TableExpressionProperty[];
  readonly parentReferenceProperties: ParentReferenceProperty[];
  readonly childCollectionProperties: ChildCollectionProperty[];
}

export interface TableFieldProperty
{
  readonly name: string; // json property name
  readonly databaseFieldName: string;
  readonly databaseType: string;
  readonly length: number | null;
  readonly precision: number | null;
  readonly fractionalDigits: number | null;
  readonly nullable: boolean | null;
  readonly specifiedSourceCodeFieldType: string | {[srcLang: string]: string} | null; // As optionally specified in query spec.
}

export interface TableExpressionProperty
{
  readonly name: string;
  readonly fieldExpression: string | null;
  readonly specifiedSourceCodeFieldType: string | {[srcLang: string]: string} | null; // As specified in query spec.
}

export interface ParentReferenceProperty
{
  readonly name: string;
  readonly refResultType: ResultTypeDescriptor
  readonly nullable: boolean | null;
}

export interface ChildCollectionProperty
{
  readonly name: string;
  readonly elResultType: ResultTypeDescriptor; // Just the collection element type without the collection type itself.
  readonly nullable: boolean | null; // Nullable when the field is inlined from a parent with a record condition.
}

export class ResultTypeDescriptorGenerator
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
  public generateResultTypeDescriptors
    (
      tjs: TableJsonSpec,
      queryName: string
    )
    : ResultTypeDescriptor[]
  {
    const topTypeDesc = new ResultTypeDescriptorBuilder(queryName);
    const resultTypes: ResultTypeDescriptor[] = []; // Top result type *and* supporting types.

    const relId = identifyTable(tjs.table, this.defaultSchema, this.dbmd, {queryName});

    // Add the table's own fields and expressions involving those fields.
    topTypeDesc.addTableFieldProperties(this.getTableFieldProperties(relId, tjs.fieldExpressions));
    topTypeDesc.addTableExpressionProperties(this.getTableExpressionProperties(relId, tjs.fieldExpressions));

    // Get contributions from inline parents (processed recursively), which may include (only)
    // properties in any of the other categories (table fields and expressions, parent references,
    // and child collections).
    const inlineParentSpecs = getInlineParentSpecs(tjs);
    if (inlineParentSpecs.length > 0)
    {
      const inlineParentContrs = this.getInlineParentContrs(relId, inlineParentSpecs, queryName);
      topTypeDesc.addProperties(inlineParentContrs.properties);
      resultTypes.push(...inlineParentContrs.resultTypes);
    }

    // Get referenced parent fields and result types, with result types from related tables.
    const refdParentSpecs = getReferencedParentSpecs(tjs);
    if (refdParentSpecs.length > 0)
    {
      const refdParentContrs = this.getReferencedParentContrs(relId, refdParentSpecs, queryName);
      topTypeDesc.addParentReferenceProperties(refdParentContrs.referenceProperties);
      resultTypes.push(...refdParentContrs.resultTypes);
    }

    // Get the child collection fields and result types, with result types from related tables.
    if (tjs.childTables)
    {
      const childCollContrs = this.getChildCollectionContrs(tjs.childTables, queryName);
      topTypeDesc.addChildCollectionProperties(childCollContrs.collectionProperties);
      resultTypes.push(...childCollContrs.resultTypes);
    }

    // The top table's type must be added at leading position in the returned list, followed
    // by any other supporting types that were generated.
    resultTypes.splice(0, 0, topTypeDesc.build(tjs.table));

    return resultTypes;
  }

  private getTableFieldProperties
    (
      relId: RelId,
      tableFieldExpressions: (string | TableFieldExpr)[] | undefined,
    )
    : TableFieldProperty[]
  {
    if (!tableFieldExpressions) return [];

    const dbFieldsByName: Map<string,Field> = this.getTableFieldsByName(relId);

    const fields: TableFieldProperty[] = [];

    for (const tfe of tableFieldExpressions)
    {
      const fieldName = typeof tfe === 'string' ? tfe : tfe.field ?? null;

      if (fieldName != null)
      {
        const dbField = dbFieldsByName.get(caseNormalizeName(fieldName, this.dbmd.caseSensitivity));
        if (dbField == undefined)
          throw new Error(`No metadata found for field ${relIdDescn(relId)}.${fieldName}.`);
        fields.push(this.makeTableFieldProperty(tfe, dbField));
      }
    }

    return fields;
  }

  getTableExpressionProperties
    (
      relId: RelId,
      tableFieldExpressions: (string | TableFieldExpr)[] | undefined
    )
    : TableExpressionProperty[]
  {
    if (!tableFieldExpressions) return [];

    const fields: TableExpressionProperty[]  = [];

    for (const tfe of tableFieldExpressions)
    {
      if (typeof tfe !== 'string' && tfe.expression != null)
      {
        const jsonProperty = tfe.jsonProperty;
        if (jsonProperty == null)
          throw new Error(`Expression field ${relIdDescn(relId)}.${tfe.expression} requires a json property.`)

        fields.push({
          name: jsonProperty,
          fieldExpression: tfe.expression,
          specifiedSourceCodeFieldType: tfe.fieldTypeInGeneratedSource || null
        });
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
    const props: Properties = { tableFieldProperties: [], tableExpressionProperties: [], parentReferenceProperties: [], childCollectionProperties: [] };
    const resultTypes: ResultTypeDescriptor[] = [];

    for (const parentSpec of parentSpecs)
    {
      // Generate types for the parent table and any related tables it includes recursively.
      const parentResTypeDescs = this.generateResultTypeDescriptors(parentSpec, queryName);
      const parentType = parentResTypeDescs[0]; // will not be generated

      // If the parent record might be absent, then all inline fields must be nullable.
      const nullable =
        parentSpec.recordCondition != null ||
        !this.someFkFieldNotNullable(parentSpec, relId, queryName);

      addToPropertiesFromResultType(props, parentType, nullable);
      resultTypes.push(...parentResTypeDescs.slice(1)); // omit "wrapper" parentType
    }

    return { properties: props, resultTypes };
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
    const parentRefProps: ParentReferenceProperty[] = [];
    const resTypeDecrs: ResultTypeDescriptor[] = [];

    for (const parentSpec of refdParentSpecs)
    {
      // Generate types for the parent table and any related tables it includes recursively.
      const parentResultTypes = this.generateResultTypeDescriptors(parentSpec, queryName);
      const resultType = parentResultTypes[0]; // parent object type

      // If the parent record might be absent, then all inline fields must be nullable.
      const nullable =
        parentSpec.recordCondition != null ||
        !!parentSpec.recordCondition ||
        !this.someFkFieldNotNullable(parentSpec, relId, queryName);

      parentRefProps.push({ name: parentSpec.referenceName, refResultType: resultType, nullable });
      resTypeDecrs.push(...parentResultTypes);
    }

    return { referenceProperties: parentRefProps, resultTypes: resTypeDecrs };
  }

  private getChildCollectionContrs
    (
      childSpecs: ChildSpec[],
      queryName: string
    )
    : ChildCollectionContrs
  {
    const collProps: ChildCollectionProperty[]  = [];
    const resTypeDescs: ResultTypeDescriptor[] = [];

    for (const childCollSpec of childSpecs)
    {
      // Generate types for the child table and any related tables it includes recursively.
      const childResultTypes = this.generateResultTypeDescriptors(childCollSpec, queryName);
      const elType = childResultTypes[0];

      // Mark the child collection element type as unwrapped if specified.
      if (childCollSpec.unwrap)
      {
        if ( propertiesCount(elType) !== 1 )
          throw new Error("Unwrapped child collection elements must have exactly one property.");
        resTypeDescs.push(...childResultTypes.slice(1)); // unwrapped types are not added to result types list
      }
      else
        resTypeDescs.push(...childResultTypes);

      collProps.push({
        name: childCollSpec.collectionName,
        elResultType: childCollSpec.unwrap ? {...elType, unwrapped: true} : elType,
        nullable: false
      });
    }

    return { collectionProperties: collProps, resultTypes: resTypeDescs };
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
      length: dbField.length != undefined ? dbField.length : null,
      precision: dbField.precision != undefined ? dbField.precision : null,
      fractionalDigits: dbField.fractionalDigits != undefined ? dbField.fractionalDigits : null,
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
    if (relMd == null) throw new Error(`Metadata for table ${relIdDescn(relId)} not found.`);

    return makeMap(relMd.fields, f => f.name, f => f);
  }

  private someFkFieldNotNullable
    (
      parentSpec: ParentSpec,
      childRelId: RelId,
      queryName: string
    )
    : boolean
  {
    const parentRelId = identifyTable(parentSpec.table, this.defaultSchema, this.dbmd, {queryName});
    const specFkFields = parentSpec.viaForeignKeyFields && new Set(parentSpec.viaForeignKeyFields) || null;
    const fk = this.dbmd.getForeignKeyFromTo(childRelId, parentRelId, specFkFields);
    if (!fk) throw new Error(`Foreign key from ${relIdDescn(childRelId)} to parent ${relIdDescn(parentRelId)} not found.`);

    const childFieldsByName = this.getTableFieldsByName(childRelId);

    for ( const fkFieldName of foreignKeyFieldNames(fk) )
    {
      const fkField = childFieldsByName.get(fkFieldName);
      if (!fkField) throw new Error(`Field not found for fk field ${fkFieldName} of table ${relIdDescn(childRelId)}.`);
      if (fkField.nullable != null && !fkField.nullable) return true;
    }

    return false;
  }
} // ResultTypesGenerator


function addToPropertiesFromResultType
  (
    props: Properties, // MUTATED in the call!
    resultType: ResultTypeDescriptor,
    forceNullable: boolean
  )
{
  props.tableExpressionProperties.push(...resultType.tableExpressionProperties);
  if (forceNullable)
  {
    // Add nullable form of each field.
    props.tableFieldProperties.push(...resultType.tableFieldProperties.map(toNullableField)); 
    props.tableExpressionProperties.push(...resultType.tableExpressionProperties);
    props.parentReferenceProperties.push(...resultType.parentReferenceProperties.map(toNullableField));
    props.childCollectionProperties.push(...resultType.childCollectionProperties.map(toNullableField));
  }
  else
  {
    props.tableFieldProperties.push(...resultType.tableFieldProperties);
    props.tableExpressionProperties.push(...resultType.tableExpressionProperties);
    props.parentReferenceProperties.push(...resultType.parentReferenceProperties);
    props.childCollectionProperties.push(...resultType.childCollectionProperties);
  }
}

class ResultTypeDescriptorBuilder
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

  addProperties(props: Properties)
  {
    this.addTableFieldProperties(props.tableFieldProperties);
    this.addTableExpressionProperties(props.tableExpressionProperties);
    this.addParentReferenceProperties(props.parentReferenceProperties);
    this.addChildCollectionProperties(props.childCollectionProperties);
  }

  build(table: string): ResultTypeDescriptor
  {
    return {
      queryName: this.queryName,
      table,
      tableFieldProperties: this.tableFieldProperties,
      tableExpressionProperties: this.tableExpressionProperties,
      parentReferenceProperties: this.parentReferenceProperties,
      childCollectionProperties: this.childCollectionProperties,
      unwrapped: false
    };
  }
} // ResultTypeDescriptorBuilder

/// Holds result properties (in the type builder) and types contributed from inline parent tables.
interface InlineParentContrs
{
  properties: Properties;
  resultTypes: ResultTypeDescriptor[];
}
/// Holds result properties and types contributed from referenced parent tables.
interface RefdParentContrs
{
  referenceProperties: ParentReferenceProperty[];
  resultTypes: ResultTypeDescriptor[];
}
/// Holds result properties and types contributed from child tables.
interface ChildCollectionContrs
{
  collectionProperties: ChildCollectionProperty[];
  resultTypes: ResultTypeDescriptor[];
}

/// Return nullable variant of a database field, for any of the above field types
/// having a "nullable" property.
function toNullableField<T extends {nullable: boolean|null}>(f: T): T
{
  return (f.nullable != null && f.nullable) ? f : {...f, nullable: true};
}

export function propertiesCount(gt: ResultTypeDescriptor): number
{
  return (
    gt.tableFieldProperties.length +
    gt.tableExpressionProperties.length +
    gt.parentReferenceProperties.length +
    gt.childCollectionProperties.length
  );
}

export function resultTypeDecriptorsEqual
  (
    rt1: ResultTypeDescriptor,
    rt2: ResultTypeDescriptor
  )
  : boolean
{
  return (
    rt1.table === rt2.table &&
    deepEquals(rt1.tableFieldProperties, rt2.tableFieldProperties) &&
    deepEquals(rt1.tableExpressionProperties,    rt2.tableExpressionProperties) &&
    deepEquals(rt1.parentReferenceProperties,  rt2.parentReferenceProperties) &&
    deepEquals(rt1.childCollectionProperties,  rt2.childCollectionProperties) &&
    rt1.unwrapped === rt2.unwrapped
  );
}
