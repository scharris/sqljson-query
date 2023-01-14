import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';
import * as dotenv from 'dotenv';
import { Client as PgClient } from 'pg';
import { createConnection } from 'mysql2/promise';
import { generateRelationsMetadata } from './gen-relsmd-lib';
import { readTextFile, writeTextFile } from '../../util/files';

export interface DbmdGenerationOptions
{
  connPropsFile: string;
  dbType: string;
  includeRegex?: string | null;
  excludeRegex?: string | null;
  generatorPomFile?: string | null;
  dbmdOutputDir: string;
  dbmdOutputFileName?: string | null;
}

export async function generateDatabaseMetadata(opts: DbmdGenerationOptions)
{
  const dbmdFile = path.join(opts.dbmdOutputDir, opts.dbmdOutputFileName ?? 'dbmd.json');
  const include = opts.includeRegex || '.*';
  const exclude = opts.excludeRegex || '^$';

  try { await fs.stat(opts.connPropsFile); }
  catch { throw new Error(`Connection properties file was not found at '${opts.connPropsFile}'.`); }

  console.log(`Generating database metadata to file ${dbmdFile}.`);
  console.log(`Including table/view pattern: '${include}'.`)
  console.log(`Excluding table/view pattern: '${exclude}'.`)

  switch (opts.dbType)
  {
    case 'pg':
      await queryViaPgClient(opts.connPropsFile, include, exclude, dbmdFile);
      break;
    case 'mysql':
      await queryViaMySQLClient(opts.connPropsFile, include, exclude, dbmdFile);
      break;
    case 'ora':
      const pomFile = path.join(__dirname, 'pom.xml');
      queryViaMaven(pomFile, opts.connPropsFile, opts.dbType, dbmdFile);
      break;
  }

  await generateRelationsMetadata({ dbmdFile, tsOutputDir: opts.dbmdOutputDir });
}

async function queryViaPgClient
  (
    connPropsFile: string,
    include: string,
    exclude: string,
    dbmdFile: string
  )
  : Promise<void>
{
  dotenv.config({ path: connPropsFile });

  const pgClient = new PgClient();
  await pgClient.connect();

  try
  {
    const sql =
      (await readTextFile(path.join(__dirname, 'src', 'main', 'resources', 'pg-dbmd.sql')))
      .replace(/:relIncludePat/g, '$1').replace(/:relExcludePat/g, '$2');

    const res = await pgClient.query(sql, [include, exclude]);

    const dbmdJson = JSON.stringify(JSON.parse(res.rows[0].json), null, 2);

    await writeTextFile(dbmdFile, dbmdJson);
  }
  finally
  {
    await pgClient.end();
  }
}

async function queryViaMySQLClient
  (
    connPropsFile: string,
    include: string,
    exclude: string,
    dbmdFile: string
  )
  : Promise<void>
{
  dotenv.config({ path: connPropsFile });

  const connectOpts = {
    connectionLimit: 1,
    host: process.env.MYSQL_HOST,
    port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  };

  const dbConn = await createConnection(connectOpts);

  try
  {
    // Replace named parameters in the SQL with ?'s and make corresponding values array.
    const paramRegex = /(:rel(In|Ex)cludePat)/g;
    const origSql = await readTextFile(path.join(__dirname, 'src', 'main', 'resources', 'mysql-dbmd.sql'));
    const sql = origSql.replace(paramRegex, '?');
    const paramMatches = Array.from(origSql.matchAll(paramRegex));
    const paramVals = paramMatches.map(paramMatch => paramMatch[2] === 'In' ? include : exclude);

    const res: [any[], any] = await dbConn.execute(sql, paramVals);

    const dbmdJson = JSON.stringify(JSON.parse(res[0][0].json), null, 2);

    await writeTextFile(dbmdFile, dbmdJson);
  }
  finally
  {
    await dbConn.end();
  }
}

function queryViaMaven
  (
    generatorPomFile: string,
    jdbcPropsFile: string,
    dbType: string,
    outputFile: string,
  )
{
  const mvnProc = spawnSync(
    os.platform() === 'win32' ? 'mvn.CMD' : 'mvn',
    ['-f', generatorPomFile,
      'compile', 'exec:java',
      `-Djdbc.props=${jdbcPropsFile}`,
      `-Ddb=${dbType}`,
      `-Ddbmd.file=${outputFile}`],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' }
  );

  if (mvnProc.status !== 0)
  {
    console.error('Maven command to generate database metadata failed:\n', mvnProc);
    throw new Error('Database metadata generation failed.');
  }
}