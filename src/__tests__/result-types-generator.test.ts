import * as path from 'https://deno.land/std@0.97.0/path/mod.ts';
import {assertEquals, assertThrows} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {propertyNameDefaultFunction} from '../util/mod.ts';
import {TableJsonSpec} from '../query-specs.ts';
import {DatabaseMetadata} from '../database-metadata.ts';
import {ResultTypesGenerator} from '../result-types-generator.ts';
import {propertiesCount} from '../result-types.ts';

const scriptDir = path.dirname(path.fromFileUrl(import.meta.url));
const dbmdPath = path.join(scriptDir, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(Deno.readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');
const resTypesGen = new ResultTypesGenerator(dbmd, 'drugs', ccPropNameFn);

Deno.test('the table referenced in a table json spec must exist in database metadata', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'table_dne',
      fieldExpressions: [
        {
          'field': 'name',
          'jsonProperty': 'tName'
        },
        'description'
      ]
    };

  assertThrows(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query'), Error, 'table_dne');
});

Deno.test('fields referenced in spec must exist in database metadata', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: [
        {
          'field': 'field_dne',
          'jsonProperty': 'dneFieldProp'
        },
        'description'
      ]
    };

  assertThrows(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query'), Error, 'field_dne');
});

Deno.test('a single result type is generated for a table spec with no parent/child specs', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['name']
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
});

Deno.test('table field property names should be as specified by jsonProperty where provided', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: [
        {
          'field': 'name',
          'jsonProperty': 'drugName'
        },
        {
          'field': 'compound_id',
          'jsonProperty': 'compoundIdentifier'
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
  assertEquals(resTypes[0].tableFieldProperties.map(p => p.name), ['drugName', 'compoundIdentifier']);
});

Deno.test('table field property names should default according to the provided naming function', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['name', 'compound_id']
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
  assertEquals(resTypes[0].tableFieldProperties.map(p => p.name), ['name', 'compoundId']);
});

Deno.test('types for non-unwrapped child tables are included in results', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'analyst',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'compoundsEntered',
          tableJson: {
            table: 'compound',
            fieldExpressions: ['id'],
          },
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: 'drugs',
          unwrap: true,
          tableJson: {
            table: 'drug',
            fieldExpressions: ['name'],
          },
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 2);

  const analystType = resTypes[0];
  assertEquals(analystType.childCollectionProperties.length, 2);

  const compoundType = analystType.childCollectionProperties[0].elResultType;
  assertEquals(compoundType.tableFieldProperties.map(p => p.name), ['id']);

  // The unwrapped drug type is referenced from the child collection property, but
  // is not listed among types to be generated.
  const drugType = analystType.childCollectionProperties[1].elResultType;
  assertEquals(drugType.tableFieldProperties.map(p => p.name), ['name']);
});

Deno.test('types for referenced parent tables are generated but not for inlined parents', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'compound',
      fieldExpressions: ['id'],
      parentTables: [
        {
          referenceName: 'enteredByAnalyst', // referenced parent
          tableJson: {
            table: 'analyst',
            fieldExpressions: ['id'],
          },
          viaForeignKeyFields: ['entered_by']
        },
        {
          // referenceName not provided, this is an an inlined parent, should not generate a result type
          tableJson: {
            table: 'analyst',
            fieldExpressions: ['short_name'],
          },
          viaForeignKeyFields: ['approved_by']
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 2);
  const compoundType = resTypes[0];
  assertEquals(compoundType.parentReferenceProperties.length, 1);
  const analystRef = compoundType.parentReferenceProperties[0];
  assertEquals(analystRef.refResultType.tableFieldProperties.map(p => p.name), ['id']);
});

Deno.test('table field properties obtained directly from inlined parent tables should be included in results', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
      parentTables: [
        {
          tableJson: {
            table: 'compound',
            fieldExpressions: [
              { field: 'id', jsonProperty: 'compoundId' },
              { field: 'display_name', jsonProperty: 'compoundDisplayName' }
            ]
          }
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
  const drugType = resTypes[0];
  assertEquals(drugType.tableFieldProperties.map(p => p.name), ['id', 'name', 'compoundId', 'compoundDisplayName']);
});

Deno.test('table field properties from an inlined parent and its own inlined parent should be included in results', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
      parentTables: [
        {
          // No 'referenceName' property, so compound is an inlined parent table here.
          tableJson: {
            table: 'compound',
            fieldExpressions: [
              { field: 'id', jsonProperty: 'compoundId' },
              { field: 'display_name', jsonProperty: 'compoundDisplayName' }
            ],
            parentTables: [
              {
                // No 'referenceName' property so analyst is an inlined parent within the inlined compound parent.
                tableJson: {
                  table: 'analyst',
                  fieldExpressions: [
                    { field: 'short_name', jsonProperty: 'compoundApprovedByAnalystShortName' }
                  ],
                },
                viaForeignKeyFields: ['approved_by']
              }
            ]
          }
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
  const drugType = resTypes[0];
  assertEquals(drugType.tableFieldProperties.map(p => p.name), [
    'id', 'name', // from the top-level table, 'drug'
    'compoundId', 'compoundDisplayName', // from the inlined parent table 'compound'
    'compoundApprovedByAnalystShortName' // from 'analyst' inlined into 'compound', inlined into 'drug' (from parent of parent of drug)
  ]);
});

Deno.test('a referenced parent property from an inlined parent should be included in results', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
      parentTables: [
        {
          // No 'referenceName' property, so compound is an inlined parent table here.
          tableJson: {
            table: 'compound',
            fieldExpressions: [
              { field: 'id', jsonProperty: 'compoundId' },
              { field: 'display_name', jsonProperty: 'compoundDisplayName' }
            ],
            parentTables: [
              {
                referenceName: 'enteredByAnalyst', // referenced parent
                tableJson: {
                  table: 'analyst',
                  fieldExpressions: ['id', 'short_name'],
                },
                viaForeignKeyFields: ['entered_by']
              },
            ]
          }
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 2);
  const drugType = resTypes[0];
  assertEquals(drugType.parentReferenceProperties.map(p => p.name),
    ['enteredByAnalyst'] // referenced parent property within inlined 'compound'
  );
  const analystType = drugType.parentReferenceProperties[0].refResultType;
  assertEquals(analystType.tableFieldProperties.map(p => p.name),
    ['id', 'shortName']
  );
});

Deno.test('non-unwrapped child collection properties should be included in results', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'analyst',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'compoundsEntered',
          tableJson: {
            table: 'compound',
            fieldExpressions: ['id', 'cas'],
          },
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: 'drugNames',
          unwrap: true,
          tableJson: {
            table: 'drug',
            fieldExpressions: ['name'],
          },
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 2);

  const analystType = resTypes[0];
  assertEquals(analystType.childCollectionProperties.map(p => p.name), ['compoundsEntered', 'drugNames']);

  const compoundType = analystType.childCollectionProperties[0].elResultType;
  assertEquals(compoundType.tableFieldProperties.map(p => p.name), ['id', 'cas']);

  // Unwrapped type is reachable through the collection property, though not listed in types to be generated.
  const drugType = analystType.childCollectionProperties[1].elResultType;
  assertEquals(drugType.tableFieldProperties.map(p => p.name), ['name']);
});

Deno.test('unwrapped child collection of table field property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'analyst',
      childTables: [
        {
          collectionName: 'idsOfCompoundsEntered',
          unwrap: true,
          tableJson: {
            table: 'compound',
            fieldExpressions: ['id'],
          },
          foreignKeyFields: ['entered_by']
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);

  const analystType = resTypes[0];
  assertEquals(analystType.childCollectionProperties.length, 1);
  const childCollProp = analystType.childCollectionProperties[0];
  assertEquals(childCollProp.name, 'idsOfCompoundsEntered');
  assertEquals(childCollProp.elResultType.unwrapped, true);
  assertEquals(propertiesCount(childCollProp.elResultType), 1);
  assertEquals(childCollProp.elResultType.tableFieldProperties.length, 1);
  assertEquals(childCollProp.elResultType.tableFieldProperties[0].databaseFieldName, 'id');
});

Deno.test('unwrapped child collection of field expression property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'analyst',
      childTables: [
        {
          collectionName: 'lowercaseNamesOfCompoundsEntered',
          unwrap: true,
          tableJson: {
            table: 'compound',
            fieldExpressions: [
              { expression: 'lowercase(display_name)', jsonProperty: 'lcName', fieldTypeInGeneratedSource: 'string' }
            ]
          },
          foreignKeyFields: ['entered_by']
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);

  const analystType = resTypes[0];
  assertEquals(analystType.childCollectionProperties.length, 1);
  const childCollProp = analystType.childCollectionProperties[0];
  assertEquals(childCollProp.name, 'lowercaseNamesOfCompoundsEntered');
  assertEquals(childCollProp.elResultType.unwrapped, true);
  assertEquals(propertiesCount(childCollProp.elResultType), 1);
  assertEquals(childCollProp.elResultType.tableExpressionProperty.length, 1);
  assertEquals(childCollProp.elResultType.tableExpressionProperty[0].name, 'lcName');
  assertEquals(childCollProp.elResultType.tableExpressionProperty[0].specifiedSourceCodeFieldType, 'string');
});

Deno.test('unwrapped child collection of parent reference property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugAnalysts',
          unwrap: true,
          tableJson: {
            table: 'drug',
            parentTables: [
              {
                referenceName: 'registeredBy',
                tableJson: {
                  table: 'analyst',
                  fieldExpressions: ['id', 'short_name']
                }
              }
            ]
          },
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 2);

  const compoundType = resTypes[0];
  assertEquals(compoundType.childCollectionProperties.length, 1);
  const childCollProp = compoundType.childCollectionProperties[0];
  assertEquals(childCollProp.name, 'drugAnalysts');
  assertEquals(childCollProp.elResultType.unwrapped, true);
  assertEquals(propertiesCount(childCollProp.elResultType), 1);
  assertEquals(childCollProp.elResultType.parentReferenceProperties.length, 1);
  assertEquals(childCollProp.elResultType.parentReferenceProperties[0].name, 'registeredBy');
  assertEquals(childCollProp.elResultType.parentReferenceProperties[0].refResultType.tableFieldProperties.length, 2);
});

Deno.test('unwrapped child collection of inlined parent property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugRegisteringAnalystIds',
          unwrap: true,
          tableJson: {
            table: 'drug',
            parentTables: [
              {
                // No reference name, 'analyst' parent properties are inlined with those of 'drug'.
                tableJson: {
                  table: 'analyst',
                  fieldExpressions: ['id']
                }
              }
            ]
          }
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
  const compoundType = resTypes[0];
  assertEquals(compoundType.childCollectionProperties.length, 1);
  const childCollProp = compoundType.childCollectionProperties[0];
  assertEquals(childCollProp.name, 'drugRegisteringAnalystIds');
  assertEquals(childCollProp.elResultType.unwrapped, true);
  assertEquals(propertiesCount(childCollProp.elResultType), 1);
  assertEquals(childCollProp.elResultType.tableFieldProperties.length, 1);
  assertEquals(childCollProp.elResultType.tableFieldProperties[0].name, 'id');
});

Deno.test('unwrapped child collection of child collection property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugAdvisories',
          unwrap: true,
          tableJson: {
            table: 'drug',
            childTables: [
              {
                collectionName: 'advisories',
                unwrap: false,
                tableJson: {
                  table: 'advisory',
                  fieldExpressions: ['id', 'advisory_type_id']
                }
              }
            ]
          },
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 2);
  const compoundType = resTypes[0];
  assertEquals(compoundType.childCollectionProperties.length, 1);
  const childCollProp = compoundType.childCollectionProperties[0];
  assertEquals(childCollProp.name, 'drugAdvisories');
  assertEquals(childCollProp.elResultType.unwrapped, true);
  assertEquals(propertiesCount(childCollProp.elResultType), 1);
  assertEquals(childCollProp.elResultType.childCollectionProperties.length, 1);
  assertEquals(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties.length, 2);
  assertEquals(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties[0].name, 'id');
  assertEquals(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties[1].name, 'advisoryTypeId');
});

Deno.test('unwrapped child collection of unwrapped child collection property is represented properly', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'compound',
      childTables: [
        {
          collectionName: 'advisoryTypeIdLists',
          unwrap: true,
          tableJson: {
            table: 'drug',
            childTables: [
              {
                collectionName: 'advisoryTypeIds',
                unwrap: true,
                tableJson: {
                  table: 'advisory',
                  fieldExpressions: ['advisory_type_id']
                }
              }
            ]
          }
        }
      ]
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  assertEquals(resTypes.length, 1);
  const compoundType = resTypes[0];
  assertEquals(compoundType.childCollectionProperties.length, 1);
  const childCollProp = compoundType.childCollectionProperties[0];
  assertEquals(childCollProp.name, 'advisoryTypeIdLists');
  assertEquals(childCollProp.elResultType.unwrapped, true);
  assertEquals(propertiesCount(childCollProp.elResultType), 1);
  assertEquals(childCollProp.elResultType.childCollectionProperties.length, 1);
  assertEquals(childCollProp.elResultType.childCollectionProperties[0].elResultType.unwrapped, true);
  assertEquals(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties[0].name, 'advisoryTypeId');
});

Deno.test('unwrapped child collection with element type containing more than one property should cause error', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'compound',
      childTables: [
        {
          collectionName: 'advisoryTypeIdLists',
          unwrap: true,
          tableJson: {
            table: 'drug',
            fieldExpressions: ['id', 'name']
          }
        }
      ]
    };

  assertThrows(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query'), Error,
    'Unwrapped child collection elements must have exactly one property'
  );
});
