import * as fs from "fs/promises";
import * as path from "path";
import * as dotenv from 'dotenv';
import * as oracledb from 'oracledb';
import {BindParameters, ExecuteOptions} from 'oracledb';

async function init(sqlFile: string, outputFile: string): Promise<void>
{
   const conn = await oracledb.getConnection();

   try
   {
      const sql = await fs.readFile(path.join(sqlFile), 'utf-8');

      const params: BindParameters = [];
      const options: ExecuteOptions = {};
      const res = await conn.execute(sql, params, options);

      if ( !res.rows )
         throw new Error('No rows in metadata result set, one row was expected.');

      const resRow = res.rows[0];

      console.log('dbmd res: ', resRow);

      if ( !Array.isArray(resRow) )
         throw new Error('Expected array result.');

      if ( resRow.length !== 1 )
         throw new Error(`Expected exactly one column in result, got ${resRow.length} instead.`);

      const jsonRes = JSON.stringify(resRow[0], null, 2);

      await fs.writeFile(outputFile, jsonRes, "utf-8");
   }
   finally
   {
      await conn.close();
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
