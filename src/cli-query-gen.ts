import {parseAppArgs,exit} from './util/mod.ts';
import {generateQuerySources, SourceGenerationOptions, SourceLanguage} from './mod.ts';

function printUsage(to: 'stderr' | 'stdout', reqdNamedParams: string[])
{
  const out = to === 'stderr' ? console.error : console.log;
  out(`Expected arguments: [options] ${reqdNamedParams.map(p => "--" + p).join(" ")}`);
  out("Options:");
  out(`   --sql-resource-path-prefix <prefix> - A prefix to the SQL file name written into source code.`);
  out(`   --types-header <file> - Contents of this file will be ` +
    "included at the top of each generated module source file (e.g. for additional imports).");
  out(`   --help - Show this message.`);
}

function getSourceLanguage(srcLang: string | undefined): SourceLanguage
{
  switch (srcLang)
  {
    case 'TS':
    case undefined: return 'TS';
    case 'Java': return 'Java';
    default: throw new Error(`Missed language case: ${srcLang}`);
  }
}

async function main(): Promise<void>
{
  const reqdNamedParams = ['dbmd', 'query-specs', 'src-output-dir', 'sql-output-dir'];
  const optlNamedParams = ['src-lang', 'sql-resource-path-prefix', 'types-header', 'java-pkg'];

  const parsedArgs = parseAppArgs(reqdNamedParams, optlNamedParams, 0);

  if ( typeof parsedArgs === 'string' )
  {
    if ( parsedArgs === 'help' )
    {
      console.log('Help requested:');
      printUsage('stdout', reqdNamedParams);
      exit(0);
    }
    else // error
    {
      console.error(`Error: ${parsedArgs}`);
      exit(1);
    }
  }

  const dbmd = parsedArgs['dbmd'];
  const querySpecs = parsedArgs['query-specs'];
  const srcOutputDir = parsedArgs['src-output-dir'];
  const sqlOutputDir = parsedArgs['sql-output-dir'];

  try
  {
    const srcGenOpts: SourceGenerationOptions & { sourceLanguage: SourceLanguage } = {
      sourceLanguage: getSourceLanguage(parsedArgs['src-lang']),
      javaPackage: parsedArgs['java-pkg'],
      sqlResourcePathPrefix: parsedArgs['sql-resource-path-prefix'] || '',
      typesHeaderFile: parsedArgs['types-header']
    };

    await generateQuerySources(querySpecs, dbmd, srcOutputDir, sqlOutputDir, srcGenOpts);
  }
  catch(e: any)
  {
    console.error('Query generation failed.');
    console.error(e);
    exit(1);
  }
}

main().then(() => console.log("Source generation completed."));
