import {PoolConfig} from 'pg';
import {Pool} from 'pg';

export function getConnectionPool(): Pool
{
  return new Pool(getConnectInfo());
}

export function getConnectInfo(): PoolConfig
{
  return {
    host: process.env.PGHOST || 'localhost',
    port: +(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'drugs',
    user: process.env.PGUSER || 'drugs',
    password: process.env.PGPASSWORD || 'drugs',
    max: 5
  };
}
