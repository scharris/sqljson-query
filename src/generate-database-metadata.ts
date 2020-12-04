import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';
import queryPostgresDbmd from './database-metadata/query-pg-dbmd-json';
import queryOracleDbmd from './database-metadata/query-ora-dbmd-json';
import {parseAppArgs} from './util/args';

async function generate
  (
    dbType: string,
    outputFile: string
  )
  : Promise<void>
{
  const dbmdJson = await dbmdQueryFn(dbType)();
  
  await fs.writeFile(outputFile, dbmdJson, "utf-8");
}

function dbmdQueryFn(dbType: string): () => Promise<string>
{
  switch ( dbType.toLowerCase() )
  {
    case 'postgresql':
    case 'postgres':
    case 'pg':
      return queryPostgresDbmd;
    case 'oracle':
    case 'ora':
      return queryOracleDbmd;
    default:
      throw new Error('Unrecognized database type');
  }
}

function printUsage(to: 'stderr' | 'stdout')
{
  const out = to === 'stderr' ? console.error : console.log;
  out(`Expected arguments: [options] ${reqdNamedParams.map(p => "--" + p).join(" ")}  <output-file>`);
  out(`Options: ${optlNamedParams.map(p => "--" + p).join(" ")}`);
}


////////////
// Start
////////////

const reqdNamedParams = ['db-type'];
const optlNamedParams = ['connection-env-file'];
const argsParseResult = parseAppArgs(process.argv.slice(2), reqdNamedParams, optlNamedParams, 1, 1);

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

const dbType = argsParseResult['db-type'];
const envFile = argsParseResult['connection-env-file'];
const outputFile = argsParseResult._[0];

if ( envFile )
  dotenv.config({ path: envFile });

generate(dbType, outputFile)
.catch(err => {
  console.error(err);
  process.exit(1);
});
