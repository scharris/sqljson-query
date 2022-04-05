import * as path from 'path';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import { generateRelationsMetadata } from './gen-relsmd';

export interface DbmdGenerationOptions
{
  jdbcPropsFile: string;
  dbType: string;
  includeRegex?: string | null;
  excludeRegex?: string | null;
  generatorPomFile: string;
  dbmdOutputDir: string;
}

export async function generateDatabaseMetadata(opts: DbmdGenerationOptions)
{
  const dbmdFile = path.join(opts.dbmdOutputDir, 'dbmd.json');
  const include = opts.includeRegex || '.*';
  const exclude = opts.excludeRegex || '^$';

  try { await fs.stat(opts.jdbcPropsFile); }
  catch { throw new Error(`JDBC properties file was not found at '${opts.jdbcPropsFile}'.`); }

  console.log(`Generating database metadata to file ${dbmdFile}.`);
  console.log(`Including table/view pattern: '${include}'.`)
  console.log(`Excluding table/view pattern: '${exclude}'.`)

  const mvnProc = spawnSync(
    'mvn',
    ['-f', opts.generatorPomFile,
     'compile', 'exec:java',
     `-Djdbc.props=${opts.jdbcPropsFile}`,
     `-Ddb=${opts.dbType}`,
     `-Ddbmd.file=${dbmdFile}`,
     `-Ddbmd.include.regex=${include}`,
     `-Ddbmd.exclude.regex=${exclude}`],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' }
  );

  if (mvnProc.status !== 0)
  {
    console.error('Maven command to generate database metadata failed:');
    console.error(mvnProc);
    throw new Error('Database metadata generation failed.');
  }

  await generateRelationsMetadata({ dbmdFile, tsOutputDir: opts.dbmdOutputDir });
}