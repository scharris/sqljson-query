import * as minimist from 'minimist';
import {generateQueries, SourceGenerationOptions} from 'sqljson-query';
import {queryGroupSpec, propertyTypeCustomizer} from './query-specs';

const reqdNamedParams = ['dbmd', 'ts-output-dir', 'sql-output-dir'];
const optlNamedParams = ['sql-resource-path-prefix', 'types-header'];

const argsParseResult = parseArgs(process.argv.slice(2), reqdNamedParams, optlNamedParams, 0);

if ( typeof argsParseResult === 'string' )
{
  if ( argsParseResult === 'help' )
  {
    console.log('Help requested:');
    printUsage('stdout');
    process.exit(0);
  }
  else // error
  {
    console.error(`Error: ${argsParseResult}`);
    process.exit(1);
  }
}

const opts: SourceGenerationOptions = {
  sqlResourcePathPrefix: argsParseResult['sql-resource-path-prefix'] || '',
  typesHeaderFile: argsParseResult['types-header'] || null,
  customPropertyTypeFn: propertyTypeCustomizer
};

generateQueries(
  queryGroupSpec,
  argsParseResult['dbmd'],
  argsParseResult['ts-output-dir'],
  argsParseResult['sql-output-dir'],
  opts
)
.catch((err: any) => {
  console.error('Query generation failed due to error:\n', err);
  process.exit(1);
});

export function parseArgs
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

function printUsage(to: 'stderr' | 'stdout')
{
  const out = to === 'stderr' ? console.error : console.log;
  out(`Expected arguments: [options] ${reqdNamedParams.map(p => "--" + p).join(" ")}`);
  out("Options:");
  out(`   --sql-resource-path-prefix <path> - A prefix to the SQL file name written into source code.`);
  out(`   --types-header <file> - Contents of this file will be ` +
    "included at the top of each generated module source file (e.g. for additional imports).");
  out(`   --help - Show this message.`);
}
