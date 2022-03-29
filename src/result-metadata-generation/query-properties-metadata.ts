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
  field: string;
  viaInlinedParentSteps?: ParentStep[];
}

export interface ExpressionPropertyMetadata
{
  type: 'expr';
  propertyName: string;
  expression: string;
  viaInlinedParentSteps?: ParentStep[];
}

export interface ChildTableCollectionPropertyMetadata
{
  type: 'child-coll';
  propertyName: string;
  table: RelId;
  properties: PropertyMetadata[];
  unwrapped: boolean;
  viaInlinedParentSteps?: ParentStep[];
}

export interface ParentReferencePropertyMetadata
{
  type: 'parent-ref';
  propertyName: string;
  table: RelId;
  properties: PropertyMetadata[];
  viaInlinedParentSteps?: ParentStep[];
}

export type ParentStep = { parent: RelId, viaFkFields: string[] };
