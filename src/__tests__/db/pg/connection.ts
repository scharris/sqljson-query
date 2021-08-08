import {Pool} from "pg";

export function getConnectionPool(): Pool
{
  return new Pool(getConnectInfo());
}

export function getConnectInfo()
{
  return {
    user: process.env.PGUSER || 'drugs',
    database: process.env.PGDATABASE || 'drugs',
    hostname: process.env.PGHOST || 'localhost',
    port: +(process.env.PGPORT || 5432),
    password: process.env.PGPASSWORD || 'drugs'
  };
}
