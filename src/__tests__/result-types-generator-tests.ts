import {TableJsonSpec} from "../query-specs";
import {propertyNameDefaultFunction} from "../util";
import {DatabaseMetadata} from '../database-metadata';
import {ResultTypesGenerator} from "../result-types-generator";
import {propertiesCount} from "../result-types";

const dbmdStoredProps = require('./resources/dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction("CAMELCASE");
const resTypesGen = new ResultTypesGenerator(dbmd, 'drugs', ccPropNameFn);

test('the table referenced in a table json spec must exist in database metadata', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "table_which_dne",
      fieldExpressions: [
        {
          "field": "name",
          "jsonProperty": "tName"
        },
        "description"
      ]
    };

  expect(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query'))
  .toThrowError(/table_which_dne/);
});

test('fields referenced in spec must exist in database metadata', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: [
        {
          "field": "field_which_dne",
          "jsonProperty": "dneFieldProp"
        },
        "description"
      ]
    };

  expect(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query'))
  .toThrowError(/field_which_dne/);
});

test('a single result type is generated for a table spec with no parent/child specs', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["name"]
    };

  expect(resTypesGen.generateResultTypes(tableJsonSpec, 'test query').length)
  .toBe(1);
});

test('simple table field property names should be as specified by jsonProperty where provided', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: [
        {
          "field": "name",
          "jsonProperty": "tName"
        },
        {
          "field": "compound_id",
          "jsonProperty": "compoundIdentifier"
        }
      ]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .simpleTableFieldProperties.map(p => p.name)
  )
  .toEqual(['tName', 'compoundIdentifier']);
});

test('simple table field property names should default according to the provided naming function', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["name", "compound_id"]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .simpleTableFieldProperties.map(p => p.name)
  )
  .toEqual(['name', 'compoundId']);
});

// An unwrapped child collection has a ResultType generated for it, to
// describe the final element type of the collection, even though the
// ResultType will not have a type declaration generated for it.
test('types for child tables are included in results', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "analyst",
      fieldExpressions: [ "id" ],
      childTables: [
        {
          collectionName: "compoundsEntered",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id" ],
          },
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: "drugs",
          unwrap: true,
          tableJson: {
            table: "drug",
            fieldExpressions: [ "id" ],
          },
        }
      ]
    };

  expect(resTypesGen.generateResultTypes(tableJsonSpec, 'test query').length)
  .toBe(3);
});

test('types for referenced parent tables are included in results but not for inlined parents', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "compound",
      fieldExpressions: [ "id" ],
      parentTables: [
        {
          referenceName: "enteredByAnalyst", // referenced parent
          tableJson: {
            table: "analyst",
            fieldExpressions: [ "id" ],
          },
          viaForeignKeyFields: ['entered_by']
        },
        {
          // referenceName not provided, this is an an inlined parent, should not generate a result type
          tableJson: {
            table: "analyst",
            fieldExpressions: [ "id" ],
          },
          viaForeignKeyFields: ['approved_by']
        }
      ]
    };

  expect(resTypesGen.generateResultTypes(tableJsonSpec, 'test query').length)
  .toBe(2);
});

test('simple table field properties obtained directly from inlined parent tables should be included in results', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["id", "name"],
      parentTables: [
        {
          tableJson: {
            table: "compound",
            fieldExpressions: [
              { field: "id", jsonProperty: "compoundId" },
              { field: "display_name", jsonProperty: "compoundDisplayName" }
            ]
          }
        }
      ]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .simpleTableFieldProperties.map(p => p.name)
  )
  .toEqual(['id', 'name', 'compoundId', 'compoundDisplayName']);
});

test('simple field properties from an inlined parent and its own inlined parent should be included in results', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["id", "name"],
      parentTables: [
        {
          // No "referenceName" property, so compound is an inlined parent table here.
          tableJson: {
            table: "compound",
            fieldExpressions: [
              { field: "id", jsonProperty: "compoundId" },
              { field: "display_name", jsonProperty: "compoundDisplayName" }
            ],
            parentTables: [
              {
                // No "referenceName" property so analyst is an inlined parent within the inlined compound parent.
                tableJson: {
                  table: "analyst",
                  fieldExpressions: [
                    { field: "short_name", jsonProperty: "compoundApprovedByAnalystShortName" }
                  ],
                },
                viaForeignKeyFields: ['approved_by']
              }
            ]
          }
        }
      ]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .simpleTableFieldProperties.map(p => p.name)
  )
  .toEqual([
    'id', 'name', // from the top-level table, "drug"
    'compoundId', 'compoundDisplayName', // from the inlined parent table "compound"
    'compoundApprovedByAnalystShortName' // from "analyst" inlined into "compound", inlined into "drug" (from parent of parent of drug)
  ]);
});

test('a referenced parent property from an inlined parent should be included in results', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["id", "name"],
      parentTables: [
        {
          // No "referenceName" property, so compound is an inlined parent table here.
          tableJson: {
            table: "compound",
            fieldExpressions: [
              { field: "id", jsonProperty: "compoundId" },
              { field: "display_name", jsonProperty: "compoundDisplayName" }
            ],
            parentTables: [
              {
                referenceName: "enteredByAnalyst", // referenced parent
                tableJson: {
                  table: "analyst",
                  fieldExpressions: [ "id" ],
                },
                viaForeignKeyFields: ['entered_by']
              },
            ]
          }
        }
      ]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .parentReferenceProperties.map(p => p.name)
  )
  .toEqual([
    'enteredByAnalyst' // referenced parent property within inlined "compound"
  ]);
});

test('child collection properties should be included in results', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "analyst",
    fieldExpressions: [ "id" ],
    childTables: [
      {
        collectionName: "compoundsEntered",
        tableJson: {
          table: "compound",
          fieldExpressions: [ "id" ],
        },
        foreignKeyFields: ['entered_by']
      },
      {
        collectionName: "drugs",
        unwrap: true,
        tableJson: {
          table: "drug",
          fieldExpressions: [ "id" ],
        },
      }
    ]
  };

  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .childCollectionProperties.map(p => p.name)
  )
  .toEqual([
    'compoundsEntered',
    'drugs'
  ]);
});

test('unwrapped child collection of simple table field property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "analyst",
    childTables: [
      {
        collectionName: "idsOfCompoundsEntered",
        unwrap: true,
        tableJson: {
          table: "compound",
          fieldExpressions: [ "id" ],
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  const childCollProp = resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].childCollectionProperties[0];

  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(childCollProp.name).toBe("idsOfCompoundsEntered");
  expect(propertiesCount(childCollProp.elResultType) === 1).toEqual(true);
  expect(childCollProp.elResultType.simpleTableFieldProperties.length).toBe(1);
  expect(childCollProp.elResultType.simpleTableFieldProperties[0].databaseFieldName).toBe("id");
});

test('unwrapped child collection of field expression property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "analyst",
    childTables: [
      {
        collectionName: "lowercaseNamesOfCompoundsEntered",
        unwrap: true,
        tableJson: {
          table: "compound",
          fieldExpressions: [
            { expression: "lowercase(name)", jsonProperty: "lcName", fieldTypeInGeneratedSource: "string" }
          ]
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  const childCollProp = resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].childCollectionProperties[0];

  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(childCollProp.name).toBe("lowercaseNamesOfCompoundsEntered");
  expect(propertiesCount(childCollProp.elResultType) === 1).toEqual(true);
  expect(childCollProp.elResultType.tableExpressionProperty.length).toBe(1);
  expect(childCollProp.elResultType.tableExpressionProperty[0].name).toBe("lcName");
  expect(childCollProp.elResultType.tableExpressionProperty[0].specifiedSourceCodeFieldType).toBe("string");
});

test('unwrapped child collection of parent reference property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "compound",
    childTables: [
      {
        collectionName: "drugRegisteringAnalysts",
        unwrap: true,
        tableJson: {
          table: "drug",
          parentTables: [
            {
              referenceName: "registeredBy",
              tableJson: {
                table: "analyst",
                fieldExpressions: ["id", "short_name"]
              }
            }
          ]
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  const childCollProp = resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].childCollectionProperties[0];

  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(childCollProp.name).toBe("drugRegisteringAnalysts");
  expect(propertiesCount(childCollProp.elResultType) === 1).toEqual(true);
  expect(childCollProp.elResultType.parentReferenceProperties.length).toBe(1);
  expect(childCollProp.elResultType.parentReferenceProperties[0].name).toBe("registeredBy");
  expect(childCollProp.elResultType.parentReferenceProperties[0].refResultType.simpleTableFieldProperties.length).toBe(2);
});

test('unwrapped child collection of inlined parent property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "compound",
    childTables: [
      {
        collectionName: "drugRegisteringAnalystIds",
        unwrap: true,
        tableJson: {
          table: "drug",
          parentTables: [
            {
              // No reference name, "analyst" parent properties are inlined with those of "drug".
              tableJson: {
                table: "analyst",
                fieldExpressions: ["id"]
              }
            }
          ]
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  const childCollProp = resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].childCollectionProperties[0];

  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(childCollProp.name).toBe("drugRegisteringAnalystIds");
  expect(propertiesCount(childCollProp.elResultType) === 1).toEqual(true);
  expect(childCollProp.elResultType.simpleTableFieldProperties.length).toBe(1);
  expect(childCollProp.elResultType.simpleTableFieldProperties[0].name).toBe("id");
});

test('unwrapped child collection of child collection property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "compound",
    childTables: [
      {
        collectionName: "drugAdvisoryTypeIds",
        unwrap: true,
        tableJson: {
          table: "drug",
          childTables: [
            {
              collectionName: "advisories",
              unwrap: false,
              tableJson: {
                table: "advisory",
                fieldExpressions: ["advisory_type_id"]
              }
            }
          ]
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  const childCollProp = resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].childCollectionProperties[0];

  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(childCollProp.name).toBe("drugAdvisoryTypeIds");
  expect(propertiesCount(childCollProp.elResultType) === 1).toEqual(true);
  expect(childCollProp.elResultType.childCollectionProperties.length).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.simpleTableFieldProperties.length).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.simpleTableFieldProperties[0].name).toBe("advisoryTypeId");
});

test('unwrapped child collection of unwrapped child collection property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "compound",
    childTables: [
      {
        collectionName: "advisoryTypeIdLists",
        unwrap: true,
        tableJson: {
          table: "drug",
          childTables: [
            {
              collectionName: "advisoryTypeIds",
              unwrap: true,
              tableJson: {
                table: "advisory",
                fieldExpressions: ["advisory_type_id"]
              }
            }
          ]
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  const childCollProp = resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].childCollectionProperties[0];

  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(childCollProp.name).toBe("advisoryTypeIdLists");
  expect(propertiesCount(childCollProp.elResultType) === 1).toEqual(true);
  expect(childCollProp.elResultType.childCollectionProperties.length).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.unwrapped).toBe(true);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.simpleTableFieldProperties[0].name).toBe("advisoryTypeId");
});

test('unwrapped child collection containing more than one should cause error', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "compound",
    childTables: [
      {
        collectionName: "advisoryTypeIdLists",
        unwrap: true,
        tableJson: {
          table: "drug",
          fieldExpressions: ["id", "name"]
        },
        foreignKeyFields: ['entered_by']
      }
    ]
  };
  
  expect(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query'))
  .toThrowError(/unwrapped child .* exactly one property/i);
});