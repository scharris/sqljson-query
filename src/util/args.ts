
export interface SplitArgs
{
  named: { [key: string]: string | null};
  positional: string[];
}

export function splitArgs(args: string[]): SplitArgs
{
  const named: { [key: string]: string | null } = {};
  const positional: string[] = [];

  for ( const arg of args )
  {
    const {name, value} = parseArg(arg);
    if ( name )
      named[name] = value;
    else
      positional.push(value || '');
  }

  return { named, positional }
}

function parseArg(arg: string): ArgInfo
{
  if ( !arg.startsWith("-") )
    return { name: null, value: arg };   // positional arg

  // Named param args should match this regex whether or not a value is included.
  const paramMatch = arg.match(/-([^:=]+)([:=](.*))?/)

  if ( !paramMatch )
    throw new Error(`Bad named parameter format: '${arg}'`);

  return { name: paramMatch[1], value: paramMatch[3] || null };
}

interface ArgInfo
{
  name: string | null;
  value: string | null;
}
