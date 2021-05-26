import {Pool} from "https://deno.land/x/postgres/mod.ts";

export function getConnectionPool(): Pool
{
  return new Pool(getConnectInfo(), 2);
}

export function getConnectInfo()
{
  return {
    user: Deno.env.get('PGUSER') || 'drugs',
    database: Deno.env.get('PGDATABASE') || 'drugs',
    hostname: Deno.env.get('PGHOST') || 'localhost',
    port: +(Deno.env.get('PGPORT') || 5432),
    password: Deno.env.get('PGPASSWORD') || 'drugs'
  };
}
