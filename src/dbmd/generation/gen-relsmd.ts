#!/usr/bin/env node
import {parseArgs} from './utils';
import {generateRelationsMetadata} from './gen-relsmd-lib';

const optionNames = [
  'dbmd',        // database metadata json file path
  'tsDir',       'tsOutputDir',
  'tsFileName',
  'javaBaseDir', 'javaOutputBaseDir',
  'javaPackage',
  'javaClass',
];

const parsedArgs = parseArgs(process.argv, [], optionNames, 0);

if ( typeof parsedArgs === 'string' ) // arg parsing error
{
  console.error(`Error: ${parsedArgs}`);
  throw new Error(parsedArgs);
}
else
{
  const opts = {
    dbmdFile: parsedArgs['dbmd'] || 'dbmd.json',
    tsOutputDir: parsedArgs['tsDir'] ?? parsedArgs['tsOutputDir'],
    tsFileName: parsedArgs['tsFileName'],
    javaOutputBaseDir: parsedArgs['javaBaseDir'] ?? parsedArgs['javaOutputBaseDir'],
    javaPackage: parsedArgs['javaPackage'],
    javaClassName: parsedArgs['javaClass'],
  };

  generateRelationsMetadata(opts)
  .then(() => console.log("Generation of relations metadata completed."))
  .catch((e: any) => {
    console.error(e);
    console.error("Generation of relations metadata failed due to error - see error detail above.");
    process.exit(1);
  });
}