import { DatabaseMetadata } from '../../dbmd';
import { PostgresDialect } from './pg';
import { OracleDialect } from './ora';
import { MySQLDialect } from './mysql';
import { H2Dialect } from './h2';
import { type SqlDialect } from './sql-dialect';

export { type SqlDialect } from './sql-dialect';

type DbmsType = 'PG' | 'ORA' | 'MYSQL' | 'H2';

export function getSqlDialect(dbmd: DatabaseMetadata, indentSpaces: number): SqlDialect
{
  const dbmsType: DbmsType = getDbmsType(dbmd.dbmsName);
  switch ( dbmsType )
  {
    case 'PG': return new PostgresDialect(indentSpaces);
    case 'ORA': return new OracleDialect(indentSpaces);
    case 'MYSQL': return new MySQLDialect(indentSpaces);
    case 'H2': return new H2Dialect(indentSpaces);
    default: throw new Error(`dbms type ${dbmsType} is currently not supported`);
  }
}

function getDbmsType(dbmsName: string): DbmsType
{
  const dbmsLower = dbmsName.toLowerCase();
  if ( dbmsLower.startsWith('postgres') ) return 'PG';
  else if ( dbmsLower.startsWith('oracle') ) return 'ORA';
  else if (dbmsLower === 'mysql') return 'MYSQL';
  else if (dbmsLower == 'h2') return 'H2';
  else throw new Error(`Database ${dbmsName} is currently not supported`);
}
