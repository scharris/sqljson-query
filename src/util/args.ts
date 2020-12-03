import * as minimist from 'minimist';

export function parseAppArgs
  (
    args: string[],
    requiredNamedArgs: string[],
    optionalNamedArgs: string[],
    minPositionalArgs: number,
    maxPositionalArgs: number | null = null
  )
  : minimist.ParsedArgs | 'help' | string
{
  if ( args.length === 1 && args[0] === '--help' )
    return 'help';

  let invalidParam = null;
  const parsedArgs = minimist(args, {
    string: [...requiredNamedArgs, ...optionalNamedArgs],
    unknown: (p) => {
      if ( p.startsWith('--') ) { invalidParam = p; return false; }
      return true;
    }
  });

  if ( invalidParam )
    return `Parameter "${invalidParam}" is not valid.`;

  if ( parsedArgs._.length < minPositionalArgs )
    return `Expected at least ${minPositionalArgs} positional arguments, got ${parsedArgs._.length}`;

  if ( maxPositionalArgs != null && parsedArgs._.length > maxPositionalArgs )
    return `Expected at most ${maxPositionalArgs} positional arguments, got ${parsedArgs._.length}`;

  for ( const param of requiredNamedArgs )
  {
    if ( !parsedArgs.hasOwnProperty(param) )
      return `Missing required parameter "${param}".`;
  }

  return parsedArgs;
}