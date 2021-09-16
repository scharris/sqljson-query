import {CaseSensitivity} from '../database-metadata';

const quotedStringRegex = /^(["`]).*\1$/;

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
