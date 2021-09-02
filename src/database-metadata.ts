import {
  computeIfAbsent,
  setsEqual,
  caseNormalizeName,
  unDoubleQuote,
  relIdDescr,
  splitSchemaAndRelationNames,
  exactUnquotedName
} from './util/mod.ts';

/// The stored part of the database metadata.
export interface DatabaseMetadataStoredProperties
{
  readonly dbmsName: string;
  readonly dbmsVersion: string;
  readonly caseSensitivity: CaseSensitivity;
  readonly relationMetadatas: RelMetadata[];
  readonly foreignKeys: ForeignKey[];
}

export interface RelMetadata
{
  readonly relationId: RelId;
  readonly relationType: RelType;
  readonly fields: Field[];
}

export interface ForeignKey
{
  readonly constraintName?: string | null;
  readonly foreignKeyRelationId: RelId;
  readonly primaryKeyRelationId: RelId;
  readonly foreignKeyComponents: ForeignKeyComponent[];
}

export interface ForeignKeyComponent
{
  readonly foreignKeyFieldName: string;
  readonly primaryKeyFieldName: string;
}

export class RelId
{
  private __nominal: void;

  private constructor(public schema: string | null, public name: string) {};

  public static make(table: string, defaultSchema: string | null, caseSensitivity: CaseSensitivity): RelId
  {
    const [schemaName, tableName] = splitSchemaAndRelationNames(table);

    if ( !tableName )
      throw new Error(`Invalid table name: '${table}''.` );

    return new RelId(
      (schemaName ?  exactUnquotedName(schemaName, caseSensitivity):
      defaultSchema ? exactUnquotedName(defaultSchema, caseSensitivity):
      null),
      exactUnquotedName(tableName, caseSensitivity)
    );
  }
}

export type RelType = 'Table' | 'View' | 'Unknown';

export interface Field
{
  readonly name: string;
  readonly databaseType: string;
  readonly nullable?: boolean | null;
  readonly primaryKeyPartNumber?: number | null;
  readonly length?: number | null;
  readonly precision?: number | null;
  readonly precisionRadix?: number | null;
  readonly fractionalDigits?: number | null;
}

export type CaseSensitivity =
  'INSENSITIVE_STORED_LOWER' |
  'INSENSITIVE_STORED_UPPER' |
  'INSENSITIVE_STORED_MIXED' |
  'SENSITIVE';


export class DatabaseMetadata implements DatabaseMetadataStoredProperties
{
  readonly schemaName?: string | null;
  readonly relationMetadatas: RelMetadata[];
  readonly foreignKeys: ForeignKey[];
  readonly caseSensitivity: CaseSensitivity;
  readonly dbmsName: string;
  readonly dbmsVersion: string;

  // derived data
  private derivedData: DerivedDatabaseMetadata;

  constructor
    (
      storedProps: DatabaseMetadataStoredProperties
    )
  {
    this.relationMetadatas = storedProps.relationMetadatas;
    this.foreignKeys = storedProps.foreignKeys;
    this.caseSensitivity = storedProps.caseSensitivity;
    this.dbmsName = storedProps.dbmsName;
    this.dbmsVersion = storedProps.dbmsVersion;

    this.derivedData = makeDerivedData(storedProps.relationMetadatas, storedProps.foreignKeys);
  }

  getRelationMetadata(relId: RelId): RelMetadata | null
  {
    return this.derivedData.getRelMetadata(relId);
  }

  getPrimaryKeyFieldNames
    (
      relId: RelId,
      alias: string | null = null
    )
    : string[]
  {
    const relMd = this.getRelationMetadata(relId);

    if ( relMd == null )
       throw new Error(`Relation metadata not found for relation id '${relIdDescr(relId)}'.`);

    return getPrimaryKeyFields(relMd).map(f => alias != null ? `${alias}.${f.name}` : f.name);
  }

  getForeignKeyFromTo
    (
      fromRelId: RelId,
      toRelId: RelId,
      fieldNames: Set<string> | null = null
    )
    : ForeignKey | null
  {
    const normdFkFieldNames = fieldNames != null ?
      new Set(Array.from(fieldNames).map(n => caseNormalizeName(n, this.caseSensitivity)))
      : null;

    let soughtFk: ForeignKey | null = null;

    for ( const fk of this.getForeignKeysFromTo(fromRelId, toRelId) )
    {
      if ( normdFkFieldNames == null || foreignKeyFieldNamesSetEquals(fk, normdFkFieldNames) )
      {
        if ( soughtFk != null ) // already found an fk satisfying requirements?
          throw new Error(
            `Multiple foreign key constraints exist from table ${relIdDescr(fromRelId)} to table ${relIdDescr(toRelId)}` +
            (fieldNames != null ?
              ' with the same specified foreign key fields.'
              : ' and no foreign key fields were specified to disambiguate.'));

        soughtFk = fk;
        // Not breaking from the loop here so case that multiple fk's satisfy requirements can be detected.
      }
    }

    return soughtFk;
  }

  private getForeignKeysFromTo
    (
      childRelId: RelId | null,
      parentRelId: RelId | null
    )
    : ForeignKey[]
  {
    const res: ForeignKey[] = [];

    if ( childRelId != null )
    {
      for ( const fk of this.derivedData.getFksFromChild(childRelId) || [] )
      {
        if ( parentRelId == null || relIdsEqual(fk.primaryKeyRelationId, parentRelId) )
          res.push(fk);
      }
    }
    else if ( parentRelId != null )
    {
      for ( const fk of this.derivedData.getFksReferencingParent(parentRelId) || [] )
        res.push(fk);
    }
    else
      this.foreignKeys.forEach(fk => res.push(fk));

    return res;
  }
}

class DerivedDatabaseMetadata
{
  constructor
  (
    private relMDsByRelId: Map<string, RelMetadata>,
    private fksByParentRelId: Map<string, ForeignKey[]>,
    private fksByChildRelId: Map<string, ForeignKey[]>,
  )
  {}

  getRelMetadata(relId: RelId): RelMetadata | null
  {
    return this.relMDsByRelId.get(relIdKey(relId)) || null;
  }

  getFksReferencingParent(relId: RelId): ForeignKey[] | null
  {
    return this.fksByParentRelId.get(relIdKey(relId)) || null;
  }

  getFksFromChild(relId: RelId): ForeignKey[] | null
  {
    return this.fksByChildRelId.get(relIdKey(relId)) || null;
  }
}

function makeDerivedData
  (
    relationMetadatas: RelMetadata[],
    foreignKeys: ForeignKey[]
  )
  : DerivedDatabaseMetadata
{
  const relMDsByRelId = new Map<string, RelMetadata>();
  const fksByParentRelId = new Map<string, ForeignKey[]>();
  const fksByChildRelId = new Map<string, ForeignKey[]>();

  for ( const relMd of relationMetadatas )
    relMDsByRelId.set(relIdKey(relMd.relationId), relMd);

  for ( const fk of foreignKeys )
  {
    const fksFromChild = computeIfAbsent(fksByChildRelId, relIdKey(fk.foreignKeyRelationId), _k => [])
    fksFromChild.push(fk);

    const fksToParent = computeIfAbsent(fksByParentRelId, relIdKey(fk.primaryKeyRelationId), _k => [])
    fksToParent.push(fk);
  }

  return new DerivedDatabaseMetadata(relMDsByRelId, fksByParentRelId, fksByChildRelId);
}

function getPrimaryKeyFields
  (
    relMd: RelMetadata
  )
  : Field[]
{
  const pks: Field[] = [];

  for ( const f of relMd.fields )
  {
    if ( f.primaryKeyPartNumber != null )
      pks.push(f);
  }

  pks.sort((f1, f2) => <any>f1.primaryKeyPartNumber - <any>f2.primaryKeyPartNumber);

  return pks;
}

function foreignKeyFieldNamesSetEquals
  (
    fk: ForeignKey,
    normalizedFkFieldNames: Set<string>
  )
  : boolean
{
  if ( fk.foreignKeyComponents.length != normalizedFkFieldNames.size )
    return false;

  const fkFieldNames = new Set<string>();

  for ( const fkComp of fk.foreignKeyComponents )
    fkFieldNames.add(fkComp.foreignKeyFieldName);

  return setsEqual(fkFieldNames, normalizedFkFieldNames);
}

export function foreignKeyFieldNames(fk: ForeignKey): string[]
{
  const fkFieldNames: string[] = [];

  for ( const fkComp of fk.foreignKeyComponents )
    fkFieldNames.push(fkComp.foreignKeyFieldName);

  return fkFieldNames;
}

function relIdKey(relId: RelId): string
{
  const relName = unDoubleQuote(relId.name);
  const schema = relId.schema ? unDoubleQuote(relId.schema) : null;
  return schema ? schema + '.' + relName : relName;
}

export function relIdsEqual(relId1: RelId, relId2: RelId)
{
  return relId1.schema === relId2.schema && relId1.name === relId2.name;
}
