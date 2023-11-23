import {DatabaseMetadata} from '../../dbmd';
import {PostgresDialect} from './pg';
import {OracleDialect} from './ora';
import {MySQLDialect} from './mysql';
import {HSQLDialect} from './hsql';
import {type SqlDialect} from './sql-dialect';

export { type SqlDialect } from './sql-dialect';

type DbmsType = 'PG' | 'MYSQL' | 'HSQL' | 'ORA' ;

export function getSqlDialect(dbmd: DatabaseMetadata, indentSpaces: number): SqlDialect
{
  const dbmsType: DbmsType = getDbmsType(dbmd.dbmsName);
  switch ( dbmsType )
  {
    case 'PG': return new PostgresDialect(indentSpaces);
    case 'MYSQL': return new MySQLDialect(indentSpaces);
    case 'HSQL': return new HSQLDialect(indentSpaces);
    case 'ORA': return new OracleDialect(indentSpaces);
    default: throw new Error(`dbms type ${dbmsType} is currently not supported`);
  }
}

function getDbmsType(dbmsName: string): DbmsType
{
  const dbmsLower = dbmsName.toLowerCase();
  if ( dbmsLower.startsWith('postgres') ) return 'PG';
  else if (dbmsLower.startsWith('mysql')) return 'MYSQL';
  else if (dbmsLower.startsWith('hsql')) return 'HSQL';
  else if ( dbmsLower.startsWith('oracle') ) return 'ORA';
  else throw new Error(`Database ${dbmsName} is currently not supported`);
}
