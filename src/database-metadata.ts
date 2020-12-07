import {computeIfAbsent, setsEqual} from './util/collections';
import {normalizeName} from './util/database-names';

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

export interface RelId
{
  schema?: string | null,
  name: string
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
       throw new Error(`Relation metadata not found for relation id '${relId}'.`);

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
      new Set(Array.from(fieldNames).map(n => normalizeName(n, this.caseSensitivity)))
      : null;

    let soughtFk: ForeignKey | null = null;

    for ( const fk of this.getForeignKeysFromTo(fromRelId, toRelId) )
    {
      if ( normdFkFieldNames == null || foreignKeyFieldNamesSetEquals(fk, normdFkFieldNames) )
      {
        if ( soughtFk != null ) // already found an fk satisfying requirements?
          throw new Error(
            `Child table ${fromRelId} has multiple foreign keys to parent table ${toRelId}` +
            (fieldNames != null ?
              ' with the same specified foreign key fields.'
              : ' and no foreign key fields were specified to disambiguate.'));

        soughtFk = fk;
        // Not breaking from the loop here so case that multiple fk's satisfy requirements can be detected.
      }
    }

    return soughtFk;
  }

  public getForeignKeysFromTo
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
    return this.relMDsByRelId.get(relIdString(relId)) || null;
  }

  getFksReferencingParent(relId: RelId): ForeignKey[] | null
  {
    return this.fksByParentRelId.get(relIdString(relId)) || null;
  }

  getFksFromChild(relId: RelId): ForeignKey[] | null
  {
    return this.fksByChildRelId.get(relIdString(relId)) || null;
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

  for ( const relMd of relationMetadatas)
    relMDsByRelId.set(relIdString(relMd.relationId), relMd);

  for ( const fk of foreignKeys )
  {
    const fksFromChild = computeIfAbsent(fksByChildRelId, relIdString(fk.foreignKeyRelationId), _k => [])
    fksFromChild.push(fk);

    const fksToParent = computeIfAbsent(fksByParentRelId, relIdString(fk.primaryKeyRelationId), _k => [])
    fksToParent.push(fk);
  }

  return new DerivedDatabaseMetadata(relMDsByRelId, fksByParentRelId, fksByChildRelId);
}

export function getPrimaryKeyFields
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

export function makeRelId
  (
    schema: string | null,
    relName: string,
    caseSensitivity: CaseSensitivity
  )
  : RelId
{
  return {
    schema: schema != null ? normalizeName(schema, caseSensitivity) : null,
    name: normalizeName(relName, caseSensitivity)
  };
}

/// Make a relation id from a given qualified or unqualified table identifier
/// and an optional default schema for interpreting unqualified table names.
export function toRelId
  (
    table: string,
    defaultSchema: string | null,
    caseSensitivity: CaseSensitivity,
  )
  : RelId
{
  const dotIx = table.indexOf('.');

  if ( dotIx != -1 ) // already qualified, split it
    return makeRelId(table.substring(dotIx+1), table.substring(0, dotIx), caseSensitivity);
  else // not qualified, qualify it if there is a default schema
    return makeRelId(defaultSchema, table, caseSensitivity);
}


export function relIdString(relId: RelId): string
{
  return relId.schema ? relId.schema + '.' + relId.name : relId.name;
}

export function relIdsEqual(relId1: RelId, relId2: RelId)
{
  return relId1.schema === relId2.schema && relId1.name === relId2.name;
}
