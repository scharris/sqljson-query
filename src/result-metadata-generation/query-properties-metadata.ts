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
  type: 'qpm-field';
  propertyName: string;
  sourceField: string;
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export interface ExpressionPropertyMetadata
{
  type: 'qpm-expr';
  propertyName: string;
  sourceExpression: string;
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export interface ChildTableCollectionPropertyMetadata
{
  type: 'qpm-child-coll';
  collectionPropertyName: string;
  table: RelId;
  properties: QueryPropertyMetadata[];
  unwrapped: boolean;
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export interface ParentReferencePropertyMetadata
{
  type: 'qpm-parent-ref';
  referencePropertyName: string;
  table: RelId;
  properties: QueryPropertyMetadata[];
  inlinedFromAncestorVia?: Nullable<ParentStep[]>;
}

export type ParentStep = { parent: RelId, fkFields: string[] };
