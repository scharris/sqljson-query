import {QuerySpec} from '../query-specs';
import {DatabaseMetadata} from '../database-metadata';
import {QuerySqlGenerator} from '../query-sql-generator';
import {propertyNameDefaultFunction} from '../util';

const dbmdStoredProps = require('./resources/dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction("CAMELCASE");

test('unqualified tables are rejected when no default schema specified', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, null, new Set(), ccPropNameFn, 2); // no default schema
  const querySpec: QuerySpec = {
    queryName: "test query",
    tableJson: {
      table: "drug", // should not be found because unqualified with no default schema specified
      fieldExpressions: ["id"],
    }
  };
  expect(() => sqlGen.generateSqls(querySpec)).toThrowError(/table 'drug' not found/i);
});

test('fully qualified table which exists in dbmd is accepted', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, null, new Set(), ccPropNameFn, 2); // no default schema
  const querySpec: QuerySpec = {
    queryName: "test query",
    resultRepresentations: ["JSON_OBJECT_ROWS"],
    tableJson: {
      table: "drugs.drug",
      fieldExpressions: [ "id" ],
    }
  };
  expect(sqlGen.generateSqls(querySpec).size).toBeGreaterThan(0);
});

test('SQL is generated for each specified result representation', () => {
  const sqlGen = new QuerySqlGenerator(dbmd, 'drugs', new Set(['drugs']), ccPropNameFn, 2);
  const querySpec: QuerySpec = {
    queryName: "test query",
    resultRepresentations: ["JSON_OBJECT_ROWS", "JSON_ARRAY_ROW", "MULTI_COLUMN_ROWS"],
    tableJson: {
      table: "drug",
      fieldExpressions: ["id", "name"],
    }
  };
  const res = sqlGen.generateSqls(querySpec);
  expect(new Set(res.keys())).toEqual(new Set(["JSON_OBJECT_ROWS", "JSON_ARRAY_ROW", "MULTI_COLUMN_ROWS"]));
});






const querySpec: QuerySpec = {
  queryName: "drugs query",
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
    childTables: [
      {
        collectionName: "brands",
        tableJson: {
          table: "brand",
          fieldExpressions: ["brand_name"],
          parentTables: [
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
          parentTables: [
            {
              tableJson: {
                table: "advisory_type",
                fieldExpressions: [
                  { field: "name", jsonProperty: "advisoryType" },
                  { expression: "(1 + 1)", jsonProperty: "exprYieldingTwo", fieldTypeInGeneratedSource: "number" },
                ],
                parentTables: [
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
          parentTables: [
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
    parentTables: [
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
          parentTables: [
            {
              referenceName: "enteredByAnalyst",
              tableJson: {
                table: "analyst",
                fieldExpressions: ["id", "short_name"]
              },
              viaForeignKeyFields: ["entered_by"]
            },
            {
              referenceName: "approvedByAnalyst",
              tableJson: {
                table: "analyst",
                fieldExpressions: ["id", "short_name"]
              },
              viaForeignKeyFields: ["approved_by"]
            }
          ]
        }
      }
    ],
  },
  orderBy: "$$.name"
};
