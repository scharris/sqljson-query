import { z } from 'zod';
import {
  computeIfAbsent,
  setsEqual,
  caseNormalizeName,
  relIdDescn,
  splitSchemaAndRelationNames,
  exactUnquotedName,
  readTextFile,
} from '../util/mod';

const CaseSensitivityDef =
  z.union([
    z.literal('INSENSITIVE_STORED_LOWER'), 
    z.literal('INSENSITIVE_STORED_UPPER'),
    z.literal('INSENSITIVE_STORED_MIXED'),
    z.literal('SENSITIVE')
  ]);
export type CaseSensitivity = z.infer<typeof CaseSensitivityDef>;

const RelTypeDef =
  z.union([
    z.literal('Table'),
    z.literal('View'),
    z.literal('Unknown')
  ]);
export type RelType = z.infer<typeof RelTypeDef>;

const RelIdDef = 
  z.object({
    schema: z.string().nullable().optional(),
    name: z.string().nonempty()
  }).strict();
export type RelId = z.infer<typeof RelIdDef>;

const FieldDef =
  z.object({
    name: z.string().nonempty(),
    databaseType: z.string().nonempty(),
    nullable: z.boolean().nullable().optional(),
    primaryKeyPartNumber: z.number().nullable().optional(),
    length: z.number().nullable().optional(),
    precision: z.number().nullable().optional(),
    precisionRadix: z.number().nullable().optional(),
    fractionalDigits: z.number().nullable().optional(),
  }).strict();
export type Field = z.infer<typeof FieldDef>;

const RelMetadataDef =
  z.object({
    relationId: RelIdDef,
    relationType: RelTypeDef,
    fields: z.array(FieldDef),
  }).strict();
export type RelMetadata = z.infer<typeof RelMetadataDef>;

const ForeignKeyComponentDef =
  z.object({
    foreignKeyFieldName: z.string(),
    primaryKeyFieldName: z.string(),
  })
  .strict();
export type ForeignKeyComponent = z.infer<typeof ForeignKeyComponentDef>;

const ForeignKeyDef =
  z.object({
    constraintName: z.string().nullable().optional(),
    foreignKeyRelationId: RelIdDef,
    primaryKeyRelationId: RelIdDef,
    foreignKeyComponents: z.array(ForeignKeyComponentDef),
  }).strict();
export type ForeignKey = z.infer<typeof ForeignKeyDef>;

const StoredDatabaseMetadataDef =
  z.object({
    dbmsName: z.string().nonempty(),
    dbmsVersion: z.string().nonempty(),
    caseSensitivity: CaseSensitivityDef,
    relationMetadatas: z.array(RelMetadataDef),
    foreignKeys: z.array(ForeignKeyDef),
  }).strict();

type StoredDatabaseMetadata = z.infer<typeof StoredDatabaseMetadataDef>;

export class DatabaseMetadata implements StoredDatabaseMetadata
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
      storedProps: StoredDatabaseMetadata
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

    if (relMd == null)
       throw new Error(`Relation metadata not found for relation id '${relIdDescn(relId)}'.`);

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
        if (soughtFk != null) // already found an fk satisfying requirements?
          throw new Error(
            `Multiple foreign key constraints exist from table ${relIdDescn(fromRelId)} to table ${relIdDescn(toRelId)}` +
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

    if (childRelId != null)
    {
      for ( const fk of this.derivedData.getFksFromChild(childRelId) || [] )
      {
        if ( parentRelId == null || relIdsEqual(fk.primaryKeyRelationId, parentRelId) )
          res.push(fk);
      }
    }
    else if (parentRelId != null)
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

  for (const relMd of relationMetadatas)
    relMDsByRelId.set(relIdKey(relMd.relationId), relMd);

  for (const fk of foreignKeys)
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

  for (const f of relMd.fields)
  {
    if (f.primaryKeyPartNumber != null)
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
  if (fk.foreignKeyComponents.length != normalizedFkFieldNames.size)
    return false;

  const fkFieldNames = new Set<string>();

  for (const fkComp of fk.foreignKeyComponents)
    fkFieldNames.add(fkComp.foreignKeyFieldName);

  return setsEqual(fkFieldNames, normalizedFkFieldNames);
}

export function foreignKeyFieldNames(fk: ForeignKey): string[]
{
  const fkFieldNames: string[] = [];

  for (const fkComp of fk.foreignKeyComponents)
    fkFieldNames.push(fkComp.foreignKeyFieldName);

  return fkFieldNames;
}

function relIdKey(relId: RelId): string
{
  return relId.schema ? `${relId.schema}.${relId.name}` : relId.name;
}

export function relIdsEqual(relId1: RelId, relId2: RelId)
{
  return relId1.schema === relId2.schema && relId1.name === relId2.name;
}

// Convert a maybe-qualified table to RelId respecting database case normalization.
export function makeRelId
  (
    tableMaybeQualified: string,
    defaultSchema: string | null,
    caseSensitivity: CaseSensitivity
  )
  : RelId
{
  const [schemaName, tableName] = splitSchemaAndRelationNames(tableMaybeQualified);

  if (!tableName)
    throw new Error(`Invalid table name: '${tableMaybeQualified}''.` );

  const schema = (
    schemaName ?  exactUnquotedName(schemaName, caseSensitivity):
    defaultSchema ? exactUnquotedName(defaultSchema, caseSensitivity):
    null
  );
  const name = exactUnquotedName(tableName, caseSensitivity);

  return { schema, name };
}

export async function readDatabaseMetadata(dbmdFile: string): Promise<DatabaseMetadata>
{
  const obj = JSON.parse(await readTextFile(dbmdFile));
  const dbmdStoredProps = StoredDatabaseMetadataDef.parse(obj);
  return new DatabaseMetadata(dbmdStoredProps);
}
