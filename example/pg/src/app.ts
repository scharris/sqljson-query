import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {QueryResult} from 'pg';
import {closePool, createPool, execSql, verifiedFieldNames, verifiedTableName} from './db-access';
import * as DrugsQuery from './generated/lib/drugs-query';
import * as DrugForIdQuery from './generated/lib/drug-for-id-query';
import {drugs as drugsSchema} from './generated/lib/relations';

// node dist/app.js dist/generated/ db/connection.env

const generatedSqlsDir = process.argv[2];
const envFile = process.argv.length === 4 ? process.argv[3] : null;

if ( envFile )
   dotenv.config({path: envFile});

// Run examples.
requireDirExists(generatedSqlsDir, "Generated SQLs directory not found.")
.then(runExampleSqls)
.catch(e => {
  console.error(e);
  process.exit(1);
});


export async function runExampleSqls(): Promise<void>
{
  createPool();

  try
  {
    const allDrugs = await getDrugs("");
    console.log("All Drugs:");
    console.log(allDrugs);
    
    const filteredDrugs = await getDrugs("2");
    console.log("Drugs matching pattern '%2%':");
    console.log(filteredDrugs);
    
    console.log("Drug 3", await getDrug(3));

    // TODO
    
    // Begin transaction:
    // Create a drug.
    // Delete a drug.
    // Update a drug.
    // Rollback
  }
  finally
  {
    await closePool();
  }
}

async function getDrugs(searchText: string | null): Promise<DrugsQuery.Drug[]>
{
   const res = await execSqlResource(DrugsQuery.sqlResource, ['%' + (searchText || '') + '%']);

   const drugs = res.rows.map((r:any) => r.json as DrugsQuery.Drug);

   return drugs;
}

async function getDrug(id: number): Promise<DrugForIdQuery.Drug | null>
{
   const res = await execSqlResource(DrugForIdQuery.sqlResource, [id]);

   const drugs = res.rows.map((r:any) => r.json as DrugForIdQuery.Drug);

   return drugs.length === 0 ? null : drugs[0];
}

async function createDrug(data: DrugData): Promise<void>
{
   // Check at compile time the table and field names to be used against database schema information.
   const drug = verifiedTableName(drugsSchema, "drug");
   const {id, name, compound_id, category_code, descr, registered_by} = verifiedFieldNames(drugsSchema.drug);

   const res = await execSql(
      `insert into ${drug}(${id}, ${name}, ${compound_id}, ${category_code}, ${descr}, ${registered_by}) ` +
      "values($1, $2, $3, $4, $5, 1)",
      [data.id, data.name, data.compoundId, data.category, data.description]
   );

   if ( res.rowCount !== 1 )
      throw new Error('Expected one row to be modified when creating drug.');
}

async function updateDrug(drugId: number, data: DrugData): Promise<void>
{
   if ( data.id !== drugId )
      throw new Error("Cannot change drug id field via update.");

   // Check at compile time the table and field names to be used against database schema information.
   const drugTable = verifiedTableName(drugsSchema, "drug");
   const {id, name, category_code, descr} = verifiedFieldNames(drugsSchema.drug);
   const res = await execSql(
      `update ${drugTable} set ${name} = $1, ${category_code} = $2, ${descr} = $3 where ${id} = $4`,
      [data.name, data.category, data.description, drugId]
   );

   if ( res.rowCount !== 1 )
      throw new Error('Expected one row to be modified when updating a drug, instead modified ' + res.rowCount + ".");
}

async function removeDrug(drugId: number): Promise<void>
{
   const drug = verifiedTableName(drugsSchema, "drug");
   const {id} = verifiedFieldNames(drugsSchema.drug);
   const res = await execSql(`delete from ${drug} where ${id} = $1`, [drugId]);

   if ( res.rowCount !== 1 )
      throw new Error('Expected one row to be modified when deleting a foo, instead modified ' + res.rowCount + ".");
}

interface DrugData
{
  id: number;
  name: string;
  compoundId: number;
  category: string;
  description: string | null;
}


async function execSqlResource(resourceName: string, params: any[]): Promise<QueryResult>
{
   const sql = await fs.readFile(path.join(generatedSqlsDir, resourceName), "utf-8");
   return execSql(sql, params);
}

async function requireDirExists(path: string, errMsg: string): Promise<void>
{
  try
  {
    const isDir = (await fs.stat(path)).isDirectory();
    if ( !isDir ) throw new Error(errMsg);
  }
  catch(e) { throw new Error(errMsg); }
}
