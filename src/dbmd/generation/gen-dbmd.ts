#!/usr/bin/env node
import { parseArgs } from './utils';
import { DbmdGenerationOptions, generateDatabaseMetadata } from './gen-dbmd-lib';

const requiredParams = [
  'connProps', // connection properties file
  'db',        // database type: pg | mysql | ora ...
  'outputDir', // database metadata output directory
]
const optionNames = [
  'include',   // table include pattern regular expression, defaulting to '.*'
  'exclude',   // table exclude pattern regular expression, defaulting to '^$'
  'outputFileName'
];

const parsedArgs = parseArgs(process.argv, requiredParams, optionNames, 0);

if (typeof parsedArgs === 'string') // arg parsing error
{
  console.error(`Error: ${parsedArgs}`);
  process.exit(1);
}
else
{
  const opts: DbmdGenerationOptions = {
    connPropsFile: parsedArgs['connProps'],
    dbType: parsedArgs['db'],
    includeRegex: parsedArgs['include'],
    excludeRegex: parsedArgs['exclude'],
    dbmdOutputDir: parsedArgs['outputDir'],
    dbmdOutputFileName: parsedArgs['outputFileName'],
  };

  if (opts.dbType === 'ora' && (opts.includeRegex || opts.excludeRegex))
  {
    console.error("Options 'include' and 'exclude' are not supported for Oracle databases.");
    process.exit(1);
  }

  generateDatabaseMetadata(opts)
  .then(() => { console.log("Database metadata generation completed."); })
  .catch((e) => {
    console.error(e);
    console.error("Database metadata generation failed due to error - see error detail above.");
    process.exit(1);
  });
}