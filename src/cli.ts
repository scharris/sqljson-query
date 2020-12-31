#!/usr/bin/env node
import {parseAppArgs} from './util/args';
import {generateQueries, SourceGenerationOptions} from './index';

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

const reqdNamedParams = ['dbmd', 'query-specs', 'ts-output-dir', 'sql-output-dir'];
const optlNamedParams = ['sql-resource-path-prefix', 'types-header'];

const argsParseResult = parseAppArgs(process.argv.slice(2), reqdNamedParams, optlNamedParams, 0);

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
  customPropertyTypeFn: null
};

generateQueries(
  argsParseResult['query-specs'],
  argsParseResult['dbmd'],
  argsParseResult['ts-output-dir'],
  argsParseResult['sql-output-dir'],
  opts
)
.catch((err: any) => {
  console.error('Query generation failed.');
  console.error(err);
  process.exit(1);
});
