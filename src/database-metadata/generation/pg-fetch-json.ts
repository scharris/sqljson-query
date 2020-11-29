import * as fs from "fs/promises";
import * as path from "path";
import * as dotenv from 'dotenv';
import { Client } from 'pg';

async function init(sqlFile: string, outputFile: string): Promise<void>
{
  const client = new Client()

  try
  {
    await client.connect()

    const sql = await fs.readFile(path.join(sqlFile), 'utf-8');

    const res = await client.query(sql);

    const resRow = res.rows[0];

    const keys = Object.keys(resRow);
    if (keys.length !== 1)
      throw new Error(`Expected exactly one column in result, got ${keys.length} instead.`);

    const jsonRes = JSON.stringify(res.rows[0][keys[0]], null, 2);

    await fs.writeFile(outputFile, jsonRes, "utf-8");
  }
  finally 
  {
    await client.end();
  }
}

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

init(sqlFile, outputFile);
