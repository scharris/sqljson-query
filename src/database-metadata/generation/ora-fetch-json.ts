import * as fs from "fs/promises";
import * as path from "path";
import * as dotenv from 'dotenv';
import * as oracledb from 'oracledb';
import {BindParameters, ExecuteOptions} from 'oracledb';

async function init
  (
    connectInfo: ConnectInfo,
    sqlFile: string,
    outputFile: string
  )
  : Promise<void>
{
  const conn = await oracledb.getConnection(connectInfo);

  try
  {
    const sql = await fs.readFile(path.join(sqlFile), 'utf-8');

    const params: BindParameters = [];
    // LOB objects are returned for lob columns by default, here we just want a string.
    const options: ExecuteOptions = {
      fetchInfo: { "DBMD": { type: oracledb.STRING } }
    };
    const resJson = requireSingleRowColumnStringResult(
      await conn.execute(sql, params, options)
    );

    const dbmd = JSON.parse(resJson);
    const formattedJson = JSON.stringify(dbmd, null, 2);

    await fs.writeFile(outputFile, formattedJson, "utf-8");
  }
  finally
  {
    await conn.close();
  }
}

interface ConnectInfo { user: string; password: string; connectString: string; }

if ( process.argv.length < 4 || process.argv.length > 5 )
{
  console.error('Expected application arguments: <sql-file> <output-file> [<connection-env-file>]');
  process.abort();
}

const sqlFile = process.argv[2];
const outputFile = process.argv[3];
const envFile = process.argv[4] || null;

if ( envFile )
  dotenv.config({ path: envFile });

const connectInfo: ConnectInfo = {
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  connectString : `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`
};

try
{
  init(connectInfo, sqlFile, outputFile);
}
catch(e)
{
  console.error('Database metadata generation failed due to error.');
  console.error(e);
  process.exit(1);
}

function requireSingleRowColumnStringResult(res: oracledb.Result<unknown>): string
{
  if (!Array.isArray(res.rows))
    throw new Error('Expected array result.');
  if (res.rows.length !== 1 || !Array.isArray(res.rows[0]) || res.rows[0].length !== 1)
    throw new Error(`Expected exactly one row and 1 column in results: ${res}.`);
  const resVal = res.rows[0][0];
  if ( typeof resVal !== 'string' )
    throw new Error(`Expected string result value, got: ${typeof resVal}.`);
  return resVal;
}
