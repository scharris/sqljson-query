import { CaseSensitivity, RelId } from '../database-metadata.ts';
import { unDoubleQuote } from './strings.ts';

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

/** Convert a relation id to a string of the form [<schema>.]<table>, without any quotes, suitable
    for displaying in prose to identify a table. Use relIdKey() instead to form a string intended to
    be used as a lookup key.
 */
export function relIdDescr(relId: RelId): string
{
  return relId.schema ? relId.schema + '.' + relId.name : relId.name;
}

// Return the quoted or unquoted schema name from the given relation name if qualified, else null.
export function getSchemaName(rel: string) : string | null
{
  const unquotedSchemaMatch = rel.match(/^([^."]+)\./);
  if ( unquotedSchemaMatch )
    return unquotedSchemaMatch[1];

  const quotedSchemaMatch = rel.match(/^("[^"]+")\./);
  if ( quotedSchemaMatch )
    return quotedSchemaMatch[1];

  return null;
}

// Return the quoted or unquoted relation name from the given relation name if qualified, else null.
export function getRelationName(rel: string) : string | null
{
  const unquotedTableMatch = rel.match(/([^".]+)$/);
  if ( unquotedTableMatch )
    return unquotedTableMatch[1];

  const quotedTableMatch = rel.match(/("[^"]+")$/);
  if ( quotedTableMatch )
    return quotedTableMatch[1];

  return null;
}

export function splitSchemaAndRelationNames(rel: string)
{
  return [getSchemaName(rel), getRelationName(rel)];
}

/**
 * Convert an unqualified name to unquoted form, with case-normalization applied iff the name
 * was originally unquoted. The idea is that such a name would always be recognized by the
 * database if it were used with quotes applied.
 */
export function exactUnquotedName
  (
    name: string,
    caseSensitivity: CaseSensitivity,
  )
  : string
{
  if ( name.startsWith('"') )
    return unDoubleQuote(name);
  else
    return caseNormalizeName(name, caseSensitivity);
}
