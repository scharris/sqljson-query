
export function verifiedFieldNames<T extends Object>(relMd: T): { [P in keyof T]: string }
{
   const res: any = {};

   for ( const fieldName of Object.keys(relMd) )
   {
      res[fieldName] = fieldName;
   }

   return res;
}

export function verifiedTableName<T extends Object>(schemaMd: T, tableName: string & keyof T): (string & keyof T)
{
   return tableName;
}
