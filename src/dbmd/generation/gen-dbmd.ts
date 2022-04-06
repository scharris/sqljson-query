import path from 'path';
import { parseArgs } from './utils';
import { generateDatabaseMetadata } from './gen-dbmd-lib';

const requiredParams = [
  'jdbcProps', // jdbc connection properties file
  'db',        // database type: pg | mysql | ora ...
  'pom',       // Maven pom file for the database metadata generator
  'outputDir', // database metadata output directory
]
const optionNames = [
  'include',   // table include pattern regular expression, defaulting to '.*'
  'exclude',   // table exclude pattern regular expression, defaulting to '^$'
];

const parsedArgs = parseArgs(process.argv, requiredParams, optionNames, 0);

if (typeof parsedArgs === 'string') // arg parsing error
{
  console.error(`Error: ${parsedArgs}`);
  process.exit(1);
}
else
{
  const opts = {
    jdbcPropsFile: parsedArgs['jdbcProps'],
    dbType: parsedArgs['db'],
    include: parsedArgs['include'] || '.*',
    exclude: parsedArgs['exclude'] || '^$',
    generatorPomFile: parsedArgs['pom'] || path.join(__dirname, 'pom.xml'),
    dbmdOutputDir: parsedArgs['outputDir'],
  };
  generateDatabaseMetadata(opts)
  .then(() => { console.log("Database metadata generation completed."); })
  .catch((e) => {
    console.error(e);
    console.error("Database metadata generation failed due to error - see error detail above.");
    process.exit(1);
  });
}