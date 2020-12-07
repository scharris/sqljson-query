import {QueryGroupSpec, QuerySpec, RecordCondition, CustomPropertyTypeFn, SimpleTableFieldProperty, ResultType} from 'sqljson-query';

function drugQuery
   (
      name: string,
      drugCond: RecordCondition | undefined
   )
   : QuerySpec
{
   return {
      queryName: name,
      resultRepresentations: ["JSON_OBJECT_ROWS"],
      generateResultTypes: true,
      tableJson: {
         table: "drug",
         fieldExpressions: [
            "id",
            "name",
            { field: "descr", jsonProperty: "description" },
            { field: "category_code", jsonProperty: "category" },
            "mesh_id",
            "cid",
            "registered",
            "market_entry_date",
            "therapeutic_indications",
            { expression: "$$.cid + 1000", jsonProperty: "cidPlus1000", fieldTypeInGeneratedSource: "number | null" },
         ],
         childTableCollections: [
            {
               collectionName: "brands",
               tableJson: {
                  table: "brand",
                  fieldExpressions: ["brand_name"],
                  inlineParentTables: [
                     {
                        tableJson: {
                           table: "manufacturer",
                           fieldExpressions: [{ field: "name", jsonProperty: "manufacturer" }]
                        }
                     }
                  ]
               }
            },
            {
               collectionName: "advisories",
               tableJson: {
                  table: "advisory",
                  fieldExpressions: [{ field: "text", jsonProperty: "advisoryText" }],
                  inlineParentTables: [
                     {
                        tableJson: {
                           table: "advisory_type",
                           fieldExpressions: [
                              { field: "name", jsonProperty: "advisoryType" },
                              { expression: "(1 + 1)", jsonProperty: "exprYieldingTwo", fieldTypeInGeneratedSource: "number" },
                           ],
                           inlineParentTables: [
                              {
                                 tableJson: {
                                    table: "authority",
                                    fieldExpressions: [
                                       { field: "name", jsonProperty: "authorityName" },
                                       { field: "url", jsonProperty: "authorityUrl" },
                                       { field: "description", jsonProperty: "authorityDescription" },
                                    ]
                                 }
                              }
                           ]
                        }
                     }
                  ]
               }
            },
            {
               collectionName: "functionalCategories",
               tableJson: {
                  table: "drug_functional_category",
                  inlineParentTables: [
                     {
                        tableJson: {
                           table: "functional_category",
                           fieldExpressions: [
                              { field: "name", jsonProperty: "categoryName" },
                              "description",
                           ]
                        }
                     },
                     {
                        tableJson: {
                           table: "authority",
                           fieldExpressions: [
                              { field: "name", jsonProperty: "authorityName" },
                              { field: "url", jsonProperty: "authorityUrl" },
                              { field: "description", jsonProperty: "authorityDescription" },
                           ]
                        }
                     }
                  ]
               }
            }
         ],
         referencedParentTables: [
            {
               referenceName: "registeredByAnalyst",
               tableJson: {
                  table: "analyst",
                  fieldExpressions: ["id", "short_name"]
               }
            },
            {
               referenceName: "compound",
               viaForeignKeyFields: [
                  "compound_id"
               ],
               tableJson: {
                  table: "compound",
                  fieldExpressions: ["display_name", "nctr_isis_id", "cas", "entered"],
                  referencedParentTables: [
                     {
                        referenceName: "enteredByAnalyst",
                        tableJson: {
                           table: "analyst",
                           fieldExpressions: ["id", "short_name"]
                        }
                     }
                  ]
               }
            }
         ],
         recordCondition: drugCond
      },
      orderBy: "$$.name"
   };
}

export const queryGroupSpec: QueryGroupSpec = {
   defaultSchema: "drugs",
   generateUnqualifiedNamesForSchemas: ["drugs"],
   outputFieldNameDefault: "CAMELCASE",
   querySpecs: [
      drugQuery("drugs query", { sql: "$$.name ilike $1" }),
      drugQuery("drug for id query", { sql: "$$.cid = $1" }),
   ]
};

export function propertyTypeCustomizer
   (
      prop: SimpleTableFieldProperty,
      resType: ResultType
   )
   : string | null
{
   if ( resType.queryName === 'drug for id query' &&
        resType.table === 'analyst' &&
        prop.name === 'shortName' )
   {
      return 'PersonShortName' + (prop.nullable ? ' | null' : '');
   }
   else if ( prop.databaseType === 'timestamptz' )
   {
      return 'TimestampTZ' + (prop.nullable ? ' | null' : '');
   }

   return null; // no customization,
}
