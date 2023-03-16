export function upperCamelCase(name: string): string
{
  return camelCase(name, true);
}

export function lowerCamelCase(name: string): string
{
  return camelCase(name, false);
}
export function lowerCaseInitials(name: string, sep: string): string
{
  const cleanedName =
    name.replaceAll(/[._ ]/g,'_')
    .replaceAll(/[^a-zA-Z0-9_]/g, "");

  const parts: string[] = [];

  for ( const word of cleanedName.split(sep) )
  {
    if (word.length > 0)
      parts.push(word.charAt(0).toLowerCase());
  }

  return parts.join("");
}

export function escapeRegExp(s: string)
{
  return s.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function replaceAll(inString: string, replace: string, replacement: string)
{
  const regex = new RegExp(escapeRegExp(replace), 'g');
  return inString.replace(regex, replacement);
}

function camelCase(name: string, upperFirst: boolean): string
{
  const parts: string[] = [];

  for ( const word of name.split(/[^a-zA-Z0-9]/) )
  {
    const wordStartChar = word.charAt(0);

    if (parts.length === 0 && !upperFirst)
      parts.push(word.toLowerCase());
    else
    {
      parts.push(wordStartChar.toUpperCase());
      parts.push(word.substring(1).toLowerCase());
    }
  }

  return parts.join("");
}

export function snakeCase(name: string, capitalizeWords: boolean): string
{
  const parts: string[] = [];

  for ( const word of name.split(/[^a-zA-Z0-9]/) )
  {
    const wordStartChar = word.charAt(0);

    parts.push(
      (capitalizeWords ? wordStartChar.toUpperCase(): wordStartChar.toLowerCase()) +
      word.substring(1).toLowerCase()
    );
  }

  return parts.join('_');
}


export function makeNameNotInSet
  (
    baseName: string,
    existingNames: Set<string>,
    suffixSep: string = ""
  )
  : string
{
  if ( !existingNames.has(baseName) )
    return baseName;
  else
  {
    let i = 1;
    while ( existingNames.has(baseName + suffixSep + i) ) ++i;
    return baseName + suffixSep + i;
  }
}

export function makeNameNotInSets
(
  baseName: string,
  avoidSets: Set<string>[],
  suffixSep: string = ""
)
  : string
{
  const nameOk = (name: string) => !avoidSets.some(set => set.has(name));
  if (nameOk(baseName))
    return baseName;
  else
  {
    let i = 1;
    while (!nameOk(baseName + suffixSep + i)) ++i;
    return baseName + suffixSep + i;
  }
}

export function indentLines
  (
    linesStr: string,
    spacesCount: number,
    indentFirstLine: boolean = true
  )
  : string
{
  const sb: string[] = [];

  const indention = ' '.repeat(spacesCount);

  let pastFirst = false;
  for ( const line of linesStr.split('\n') )
  {
    if (pastFirst)
      sb.push('\n');

    if ( (pastFirst || indentFirstLine) && line.length > 0 )
      sb.push(indention);

    sb.push(line);

    if (!pastFirst)
      pastFirst = true;
  }

  return sb.join('');
}

export function unDoubleQuote(s: string): string
{
  if ( s.startsWith("\"") && s.endsWith("\"") )
    return s.length == 1 ? '' : s.substring(1, s.length-1);
  return s;
}

export function hashString(s: string): number
{
  let hash = 0;
  for (let i = 0; i < s.length; ++i)
  {
    const chr   = s.charCodeAt(i);
    hash  = (hash * 31) + chr;
    hash |= 0;
  }
  return hash;
}
