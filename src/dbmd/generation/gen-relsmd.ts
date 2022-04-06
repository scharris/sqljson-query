#!/usr/bin/env node
import path from 'path';
import { parseArgs } from './utils';
import { generateRelationsMetadata } from './gen-relsmd-lib';

const optionNames = [
  'dbmd',        // database metadata json file path
  'tsOutputDir',
  'javaOutputBaseDir',
  'javaPackage',
];

const parsedArgs = parseArgs(process.argv, [], optionNames, 0);

if ( typeof parsedArgs === 'string' ) // arg parsing error
{
  console.error(`Error: ${parsedArgs}`);
  throw new Error(parsedArgs);
}
else
{
  const internalDbmdDir = path.join(__dirname, '..', 'dbmd');

  const opts = {
    dbmdFile: parsedArgs['dbmd'] || path.join(internalDbmdDir, 'dbmd.json'),
    tsOutputDir: parsedArgs['tsOutputDir'],
    javaOutputBaseDir: parsedArgs['javaOutputBaseDir'],
    javaPackage: parsedArgs['javaPackage'],
  };

  generateRelationsMetadata(opts)
  .then(() => console.log("Generation of relations metadata completed."))
  .catch((e: any) => {
    console.error(e);
    console.error("Generation of relations metadata failed due to error - see error detail above.");
    process.exit(1);
  });
}