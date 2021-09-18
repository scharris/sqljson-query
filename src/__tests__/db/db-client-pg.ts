import {Client} from "pg";
import {getConnectInfo as getPgConnectInfo} from './pg/connection';

export async function getDbClient(): Promise<Client>
{
  const client = new Client(getPgConnectInfo());
  await client.connect();
  return client;
}
