import {Client} from "https://deno.land/x/postgres/mod.ts";
import {getConnectInfo} from './pg/connection.ts';

export interface QueryResult {
  rows: any[];
}

export async function getDbClient(): Promise<Client>
{
  const client = new Client(getConnectInfo());
  await client.connect();
  return client;
}
