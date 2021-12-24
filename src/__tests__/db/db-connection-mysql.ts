import {getConnectInfo} from './mysql/connection';
import {createConnection, Connection} from "https://deno.land/x/mysql2/mod.ts";


export async function getDbConnection(): Promise<Connection>
{
  return createConnection(getConnectInfo());
}
