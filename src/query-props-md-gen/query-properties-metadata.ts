import { RelId } from '../dbmd';
import { Nullable } from '../util/mod';

export interface QueryPropertiesMetadata
{
  queryName: string;
  table: RelId;
  properties: QueryPropertyMetadata[];
}

export type QueryPropertyMetadata =
  FieldPropertyMetadata |
  ExpressionPropertyMetadata |
  ChildTableCollectionPropertyMetadata |
  ParentReferencePropertyMetadata;

export interface FieldPropertyMetadata
{
  type: 'field';
  propertyName: string;
  sourceField: string;
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export interface ExpressionPropertyMetadata
{
  type: 'expr';
  propertyName: string;
  sourceExpression: string;
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export interface ChildTableCollectionPropertyMetadata
{
  type: 'child-coll';
  collectionPropertyName: string;
  table: RelId;
  properties: QueryPropertyMetadata[];
  unwrapped: boolean;
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export interface ParentReferencePropertyMetadata
{
  type: 'parent-ref';
  referencePropertyName: string;
  table: RelId;
  properties: QueryPropertyMetadata[];
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export type ParentStep = { parent: RelId, fkFields: string[] };
