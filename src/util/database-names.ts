import {CaseSensitivity} from '../database-metadata.ts';

const lowercaseNameRegex = /^[a-z_]+$/;
const uppercaseNameRegex = /^[A-Z_]+$/;
const quotedStringRegex = /^".*"$/;

export function quoteIfNeeded
  (
    id: string,
    caseSensitivity: CaseSensitivity
  )
  : string
{
  if ( quotedStringRegex.test(id) )
    return id;
  if ( id.charAt(0) === '_' )
    return `"${id}"`;
  if ( caseSensitivity === 'INSENSITIVE_STORED_LOWER' && lowercaseNameRegex.test(id) )
    return id;
  if ( caseSensitivity === 'INSENSITIVE_STORED_UPPER' && uppercaseNameRegex.test(id) )
    return id;
  return `"${id}"`;
}

export function caseNormalizeName
  (
    id: string,
    caseSensitivity: CaseSensitivity
  )
  : string
{
  if ( quotedStringRegex.test(id) )
    return id;
  else if ( caseSensitivity === 'INSENSITIVE_STORED_LOWER' )
    return id.toLowerCase();
  else if ( caseSensitivity === 'INSENSITIVE_STORED_UPPER' )
    return id.toUpperCase();
  else
    return id;
}
