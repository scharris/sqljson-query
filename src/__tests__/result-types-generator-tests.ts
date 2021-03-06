import {propertyNameDefaultFunction} from '../util';
import {TableJsonSpec} from '../query-specs';
import {DatabaseMetadata} from '../database-metadata';
import {ResultTypesGenerator} from '../result-types-generator';
import {propertiesCount} from '../result-types';

const dbmdStoredProps = require('./db/pg/dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE');
const resTypesGen = new ResultTypesGenerator(dbmd, 'drugs', ccPropNameFn);

test('the table referenced in a table json spec must exist in database metadata', () => {
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

  expect(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query')).toThrowError(/table_dne/);
});

test('fields referenced in spec must exist in database metadata', () => {
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

  expect(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query')).toThrowError(/field_dne/);
});

test('a single result type is generated for a table spec with no parent/child specs', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['name']
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  expect(resTypes.length).toBe(1);
});

test('table field property names should be as specified by jsonProperty where provided', () => {
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
  expect(resTypes.length).toBe(1);
  expect(resTypes[0].tableFieldProperties.map(p => p.name)).toEqual(
    ['drugName', 'compoundIdentifier']
  );
});

test('table field property names should default according to the provided naming function', () => {
  const tableJsonSpec: TableJsonSpec =
    {
      table: 'drug',
      fieldExpressions: ['name', 'compound_id']
    };

  const resTypes = resTypesGen.generateResultTypes(tableJsonSpec, 'test query');
  expect(resTypes.length).toBe(1);
  expect(resTypes[0].tableFieldProperties.map(p => p.name)).toEqual(
    ['name', 'compoundId']
  );
});

test('types for non-unwrapped child tables are included in results', () => {
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
  expect(resTypes.length).toBe(2);

  const analystType = resTypes[0];
  expect(analystType.childCollectionProperties.length).toBe(2);

  const compoundType = analystType.childCollectionProperties[0].elResultType;
  expect(compoundType.tableFieldProperties.map(p => p.name)).toEqual(['id']);

  // The unwrapped drug type is referenced from the child collection property, but
  // is not listed among types to be generated.
  const drugType = analystType.childCollectionProperties[1].elResultType;
  expect(drugType.tableFieldProperties.map(p => p.name)).toEqual(['name']);
});

test('types for referenced parent tables are generated but not for inlined parents', () => {
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
  expect(resTypes.length).toBe(2);
  const compoundType = resTypes[0];
  expect(compoundType.parentReferenceProperties.length).toBe(1);
  const analystRef = compoundType.parentReferenceProperties[0];
  expect(analystRef.refResultType.tableFieldProperties.map(p => p.name)).toEqual(['id']);
});

test('table field properties obtained directly from inlined parent tables should be included in results', () => {
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
  expect(resTypes.length).toBe(1);
  const drugType = resTypes[0];
  expect(drugType.tableFieldProperties.map(p => p.name)).toEqual(
    ['id', 'name', 'compoundId', 'compoundDisplayName']
  );
});

test('table field properties from an inlined parent and its own inlined parent should be included in results', () => {
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
  expect(resTypes.length).toBe(1);
  const drugType = resTypes[0];
  expect(drugType.tableFieldProperties.map(p => p.name)).toEqual(
    [
      'id', 'name', // from the top-level table, 'drug'
      'compoundId', 'compoundDisplayName', // from the inlined parent table 'compound'
      'compoundApprovedByAnalystShortName' // from 'analyst' inlined into 'compound', inlined into 'drug' (from parent of parent of drug)
    ]
  );
});

test('a referenced parent property from an inlined parent should be included in results', () => {
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
  expect(resTypes.length).toBe(2);
  const drugType = resTypes[0];
  expect(drugType.parentReferenceProperties.map(p => p.name)).toEqual(
    ['enteredByAnalyst'] // referenced parent property within inlined 'compound'
  );
  const analystType = drugType.parentReferenceProperties[0].refResultType;
  expect(analystType.tableFieldProperties.map(p => p.name)).toEqual(
    ['id', 'shortName']
  );
});

test('non-unwrapped child collection properties should be included in results', () => {
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
  expect(resTypes.length).toBe(2);

  const analystType = resTypes[0];
  expect(analystType.childCollectionProperties.map(p => p.name)).toEqual(['compoundsEntered', 'drugNames']);

  const compoundType = analystType.childCollectionProperties[0].elResultType;
  expect(compoundType.tableFieldProperties.map(p => p.name)).toEqual(['id', 'cas']);

  // Unwrapped type is reachable through the collection property, though not listed in types to be generated.
  const drugType = analystType.childCollectionProperties[1].elResultType;
  expect(drugType.tableFieldProperties.map(p => p.name)).toEqual(['name']);
});

test('unwrapped child collection of table field property is represented properly', () => {
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
  expect(resTypes.length).toBe(1);

  const analystType = resTypes[0];
  expect(analystType.childCollectionProperties.length).toBe(1);
  const childCollProp = analystType.childCollectionProperties[0];
  expect(childCollProp.name).toBe('idsOfCompoundsEntered');
  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(propertiesCount(childCollProp.elResultType)).toBe(1);
  expect(childCollProp.elResultType.tableFieldProperties.length).toBe(1);
  expect(childCollProp.elResultType.tableFieldProperties[0].databaseFieldName).toBe('id');
});

test('unwrapped child collection of field expression property is represented properly', () => {
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
  expect(resTypes.length).toBe(1);

  const analystType = resTypes[0];
  expect(analystType.childCollectionProperties.length).toBe(1);
  const childCollProp = analystType.childCollectionProperties[0];
  expect(childCollProp.name).toBe('lowercaseNamesOfCompoundsEntered');
  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(propertiesCount(childCollProp.elResultType)).toBe(1);
  expect(childCollProp.elResultType.tableExpressionProperty.length).toBe(1);
  expect(childCollProp.elResultType.tableExpressionProperty[0].name).toBe('lcName');
  expect(childCollProp.elResultType.tableExpressionProperty[0].specifiedSourceCodeFieldType).toBe('string');
});

test('unwrapped child collection of parent reference property is represented properly', () => {
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
  expect(resTypes.length).toBe(2);

  const compoundType = resTypes[0];
  expect(compoundType.childCollectionProperties.length).toBe(1);
  const childCollProp = compoundType.childCollectionProperties[0];
  expect(childCollProp.name).toBe('drugAnalysts');
  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(propertiesCount(childCollProp.elResultType)).toBe(1);
  expect(childCollProp.elResultType.parentReferenceProperties.length).toBe(1);
  expect(childCollProp.elResultType.parentReferenceProperties[0].name).toBe('registeredBy');
  expect(childCollProp.elResultType.parentReferenceProperties[0].refResultType.tableFieldProperties.length).toBe(2);
});

test('unwrapped child collection of inlined parent property is represented properly', () => {
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
  expect(resTypes.length).toBe(1);
  const compoundType = resTypes[0];
  expect(compoundType.childCollectionProperties.length).toBe(1);
  const childCollProp = compoundType.childCollectionProperties[0];
  expect(childCollProp.name).toBe('drugRegisteringAnalystIds');
  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(propertiesCount(childCollProp.elResultType)).toBe(1);
  expect(childCollProp.elResultType.tableFieldProperties.length).toBe(1);
  expect(childCollProp.elResultType.tableFieldProperties[0].name).toBe('id');
});

test('unwrapped child collection of child collection property is represented properly', () => {
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
  expect(resTypes.length).toBe(2);
  const compoundType = resTypes[0];
  expect(compoundType.childCollectionProperties.length).toBe(1);
  const childCollProp = compoundType.childCollectionProperties[0];
  expect(childCollProp.name).toBe('drugAdvisories');
  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(propertiesCount(childCollProp.elResultType)).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties.length).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties.length).toBe(2);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties[0].name).toBe('id');
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties[1].name).toBe('advisoryTypeId');
});

test('unwrapped child collection of unwrapped child collection property is represented properly', () => {
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
  expect(resTypes.length).toBe(1);
  const compoundType = resTypes[0];
  expect(compoundType.childCollectionProperties.length).toBe(1);
  const childCollProp = compoundType.childCollectionProperties[0];
  expect(childCollProp.name).toBe('advisoryTypeIdLists');
  expect(childCollProp.elResultType.unwrapped).toBe(true);
  expect(propertiesCount(childCollProp.elResultType)).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties.length).toBe(1);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.unwrapped).toBe(true);
  expect(childCollProp.elResultType.childCollectionProperties[0].elResultType.tableFieldProperties[0].name).toBe('advisoryTypeId');
});

test('unwrapped child collection with element type containing more than one property should cause error', () => {
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

  expect(() => resTypesGen.generateResultTypes(tableJsonSpec, 'test query')).toThrowError(
    /unwrapped child .* exactly one property/i
  );
});
