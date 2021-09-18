import {getConnectInfo} from './mysql/connection';
import {createConnection, Connection} from 'mysql2/promise';

export async function getDbConnection(): Promise<Connection>
{
  return createConnection(getConnectInfo());
}
