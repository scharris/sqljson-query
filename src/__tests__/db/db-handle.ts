export interface QueryResult {
  rows: any[];
}

export interface DbHandle {
  query(sql: string): Promise<QueryResult>;
  end(): Promise<void>;
}

export function getDbHandle(dbType: string): DbHandle
{
  switch(dbType)
  {
    case 'pg':
      {
        const pg = require('./pg/connection');
        const dbPool: DbHandle = pg.getConnectionPool();
        return dbPool;
      }
    case 'mysql':
      throw new Error('TODO'); // TODO
    default:
      throw new Error(`Database type ${dbType} is not supported.`);
  }
}