import {Client} from "pg";
import {getConnectInfo} from './pg/connection';

export async function getDbClient(): Promise<Client>
{
  const client = new Client(getConnectInfo());
  await client.connect();
  return client;
}

export interface QueryResult {
  rows: any[];
}
