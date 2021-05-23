import {PropertyNameDefault} from '../query-specs.ts';
import {lowerCamelCase} from './strings.ts';

export function propertyNameDefaultFunction
  (
    propNameDefault: PropertyNameDefault | undefined
  )
  : (fieldName: string) => string
{
  switch ( propNameDefault || "CAMELCASE" )
  {
    case 'AS_IN_DB': return fieldName => fieldName;
    case 'CAMELCASE': return lowerCamelCase;
  }
}

