import { RelId } from '../dbmd';

export interface QueryPropertiesMetadata
{
  queryName: string;
  table: RelId;
  properties: PropertyMetadata[];
}

export type PropertyMetadata =
  FieldPropertyMetadata |
  ExpressionPropertyMetadata |
  ChildTableCollectionPropertyMetadata |
  ParentReferencePropertyMetadata;

export interface FieldPropertyMetadata
{
  type: 'field';
  propertyName: string;
  sourceField: string;
  inlinedFromAncestorVia?: ParentStep[];
}

export interface ExpressionPropertyMetadata
{
  type: 'expr';
  propertyName: string;
  sourceExpression: string;
  inlinedFromAncestorVia?: ParentStep[];
}

export interface ChildTableCollectionPropertyMetadata
{
  type: 'child-coll';
  collectionPropertyName: string;
  table: RelId;
  properties: PropertyMetadata[];
  unwrapped: boolean;
  inlinedFromAncestorVia?: ParentStep[];
}

export interface ParentReferencePropertyMetadata
{
  type: 'parent-ref';
  referencePropertyName: string;
  table: RelId;
  properties: PropertyMetadata[];
  inlinedFromAncestorVia?: ParentStep[];
}

export type ParentStep = { parent: RelId, fkFields: string[] };
