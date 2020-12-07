import * as Pool from 'pg-pool';
import { Client, QueryConfig, QueryResult } from 'pg';


let connPool: Pool<Client> | null = null;

function pool()
{
  if (!connPool)
    throw new Error('Attempt to use connection pool before it has been initialized.');
  return connPool;
}

export function createPool(): void
{
  const env = process.env;

  if (!env.PGDATABASE || !env.PGUSER || !env.PGPASSWORD)
    throw new Error("One or more required database connection values are not defined.");

  connPool = new Pool({
    host: env.PGHOST || 'localhost',
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    port: parseInt(env.PGPORT as string, 10) || 5432,
    ssl: false,
    max: 2, // set higher for prod
    connectionTimeoutMillis: 1000, // return an error after 1 second if connection could not be established
  });

  connPool.on('error', (err, client) =>
  {
    console.error('pg-pool: Encountered unexpected error on idle client', err);
  });
}

export async function closePool(): Promise<void>
{
  console.log('\nClosing database connection pool.');
  await pool().end();
}

/** Execute the given query using the shared connection pool, returning the connection when completed. */
export async function execSql(sql: string | QueryConfig, params: any[]): Promise<QueryResult>
{
  try
  {
    return await pool().query(sql, params);
  }
  catch (e)
  {
    console.error(`Error executing query: `, e, '\nsql: ', sql, ' params: ', params);
    throw e;
  }
}
