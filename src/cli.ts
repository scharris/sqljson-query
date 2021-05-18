#!/usr/bin/env node
import {parseAppArgs} from './util';
import {generateQueries, SourceGenerationOptions} from './index';

function printUsage(to: 'stderr' | 'stdout')
{
  const out = to === 'stderr' ? console.error : console.log;
  out(`Expected arguments: [options] ${reqdNamedParams.map(p => "--" + p).join(" ")}`);
  out("Options:");
  out(`   --sql-resource-path-prefix <prefix> - A prefix to the SQL file name written into source code.`);
  out(`   --types-header <file> - Contents of this file will be ` +
    "included at the top of each generated module source file (e.g. for additional imports).");
  out(`   --help - Show this message.`);
}

const reqdNamedParams = ['dbmd', 'query-specs', 'src-output-dir', 'sql-output-dir'];
const optlNamedParams = ['src-lang', 'sql-resource-path-prefix', 'types-header'];

const parsedArgs = parseAppArgs(process.argv.slice(2), reqdNamedParams, optlNamedParams, 0);

if ( typeof parsedArgs === 'string' )
{
  if ( parsedArgs === 'help' )
  {
    console.log('Help requested:');
    printUsage('stdout');
    process.exit(0);
  }
  else // error
  {
    console.error(`Error: ${parsedArgs}`);
    process.exit(1);
  }
}

const srcGenOpts: SourceGenerationOptions = {
  sourceLanguage: parsedArgs['src-lang'] || 'TypeScript',
  sqlResourcePathPrefix: parsedArgs['sql-resource-path-prefix'] || '',
  typesHeaderFile: parsedArgs['types-header']
};

const {querySpecs, dbmd, srcOutDir, sqlOutDir} = parsedArgs;

generateQueries(querySpecs, dbmd, srcOutDir, sqlOutDir, srcGenOpts)
.catch((err: any) => {
  console.error('Query generation failed.');
  console.error(err);
  process.exit(1);
});
