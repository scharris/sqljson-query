export function getConnectInfo()
{
  return {
    connectionLimit: 5,
    host: process.env.MYSQL_HOST || 'localhost',
    port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'drugs',
    password: process.env.MYSQL_PASSWORD || 'drugs',
    database: process.env.MYSQL_DATABASE || 'drugs',
  };
}
