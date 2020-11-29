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
  const parts: string[] = [];

  for ( const word of name.split(sep) )
  {
    if ( word.length > 0 )
      parts.push(word.charAt(0).toLowerCase());
  }

  return parts.join("");
}

export function camelCase(name: string, upperFirst: boolean): string
{
  const parts: string[] = [];

  for ( const word of name.split(/[_ -]/) )
  {
    const wordStartChar = word.charAt(0);

    if ( parts.length === 0 && !upperFirst )
      parts.push(word.toLowerCase());
    else
    {
      parts.push(wordStartChar.toUpperCase());
      parts.push(word.substring(1).toLowerCase());
    }
  }

  return parts.join("");
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
  for ( const line of linesStr.split("\n") )
  {
    if ( pastFirst )
      sb.push('\n');
    
    if ( pastFirst || indentFirstLine )
      sb.push(indention);
    
    sb.push(line);
    
    if ( !pastFirst )
      pastFirst = true;
  }

  return sb.join("");
}

export function unDoubleQuote(s: string): string
{
  if ( s.startsWith("\"") && s.endsWith("\"") )
    return s.substring(1, s.length-1);
  return s;
}
