import { CaseSensitivity } from '../dbmd/database-metadata';
import { PropertyNameDefault } from '../query-specs';
import { lowerCamelCase, snakeCase, upperCamelCase } from './strings';

export function propertyNameDefaultFunction
  (
    propNameDefault: PropertyNameDefault | null | undefined,
    caseSensitivity: CaseSensitivity
  )
  : (fieldName: string) => string
{
  switch ( propNameDefault || "CAMELCASE" )
  {
    case 'AS_IN_DB':
      switch (caseSensitivity)
      {
        case 'INSENSITIVE_STORED_LOWER':
          return fieldName => isMixedCase(fieldName) ? fieldName : fieldName.toLowerCase();
        case 'INSENSITIVE_STORED_UPPER':
          return fieldName => isMixedCase(fieldName) ? fieldName : fieldName.toUpperCase();
        default:
          return fieldName => fieldName;
      }
    case 'CAMELCASE':
      return lowerCamelCase;
    case 'UPPER_CAMELCASE':
      return upperCamelCase;
    case 'INIT_CAPS_SNAKE_CASE':
      return name => snakeCase(name, true);
  }
}

function isMixedCase(s: string): boolean
{
  return /[a-z]/.exec(s) != null && /[A-Z]/.exec(s) != null;
}