import * as path from 'path';
import {QuerySpec} from '../query-specs';
import {DatabaseMetadata} from '../dbmd';
import {propertyNameDefaultFunction} from '../util/mod';
import {readTextFileSync} from '../util/files';
import {SqlSpecGenerator} from '../sql-generation';
import {
  ChildCollectionSelectEntry,
  InlineParentSelectEntry,
  ParentReferenceSelectEntry
} from '../sql-generation/sql-specs';

const dbmdPath = path.join(__dirname, 'db', 'pg', 'dbmd.json');
const dbmdStoredProps = JSON.parse(readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE', dbmd.caseSensitivity);

test('unqualified tables are rejected when no default schema specified', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, null, ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    tableJson: {
      table: 'drug', // should not be found because unqualified with no default schema specified
      fieldExpressions: ['id'],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/table 'drug'.* not found/i);
});

test('fully qualified table which exists in dbmd is accepted without a default schema', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, null, ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drugs.drug',
      fieldExpressions: ['id'],
    }
  };

  expect(sqlSpecGen.generateSqlSpecs(querySpec).size).toBeGreaterThan(0);
});

test('non-existent table specified fully-qualifed causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, null, ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drugs.table_which_dne',
      fieldExpressions: ['id'],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/table_which_dne/);
});

test('non-existent table specified with default schema causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'table_which_dne',
      fieldExpressions: ['id'],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/table_which_dne/);
});

test('fields referenced in a query spec must exist in database metadata', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        {
          'field': 'field_dne',
          'jsonProperty': 'dneFieldProp'
        },
        'description'
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/field_dne/);
});

test('table field property names should be as specified by jsonProperty in query spec where provided', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        {
          'field': 'name',
          'jsonProperty': 'drugName'
        },
        {
          'field': 'compound_id',
          'jsonProperty': 'compoundIdentifier'
        },
        {
          'expression': 'compound_id + 1',
          'jsonProperty': 'compoundIdPlus1',
          fieldTypeInGeneratedSource: 'int'
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['drugName', 'compoundIdentifier', 'compoundIdPlus1']
  );
});


test('table field property names should default according to the provided naming function', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        'name',
        'compound_id',
        {
          'field': 'mesh_id', jsonProperty: 'the_mesh_id'
        },
        {
          'expression': 'compound_id + 1',
          'jsonProperty': 'compoundIdPlus1',
          fieldTypeInGeneratedSource: 'int'
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['name', 'compoundId', 'the_mesh_id', 'compoundIdPlus1']
  );
});

test('additional object property columns from a JSON_OBJECT_ROWS query are included properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    additionalOutputColumns: ['id', 'name'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        'compound_id',
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;
  // @ts-ignore
  expect(sqlSpec.additionalOutputSelectEntries.map(se => se.field.name)).toEqual(
    ['id', 'name']
  );
});

test('specified additional object property columns must exist in JSON_OBJECT_ROWS query', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    additionalOutputColumns: ['id', 'nameX'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        'id',
        'name',
        'compound_id',
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/not found.*nameX/i);
});

test('wrapped child collections and their row object properties are included properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'analyst',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'compoundsEntered',
          table: 'compound',
          fieldExpressions: ['id', 'display_name'],
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: 'drugs',
          table: 'drug',
          fieldExpressions: ['mesh_id', 'compound_id', 'name'],
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.length).toEqual(3);
  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(2);

  const compoundsProp = childCollProps[0];
  expect(compoundsProp.entryType).toEqual('se-child-coll');
  const compoundsSubquery = (<ChildCollectionSelectEntry>compoundsProp).collectionSql;
  expect(compoundsSubquery.selectEntries.map(e => e.projectedName)).toEqual(
    ['id', 'displayName']
  );

  const drugsProp = childCollProps[1];
  expect(drugsProp.entryType).toBe('se-child-coll');
  const drugsSubquery = (<ChildCollectionSelectEntry>drugsProp).collectionSql;
  expect(drugsSubquery.selectEntries.map(e => e.projectedName)).toEqual(
    ['meshId', 'compoundId', 'name']
  );
});

test('referenced parent property and sub-properties are generated properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      fieldExpressions: ['id'],
      parentTables: [
        {
          referenceName: 'enteredByAnalyst', // referenced parent
          table: 'analyst',
          fieldExpressions: ['id', 'short_name'],
          viaForeignKeyFields: ['entered_by']
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  const parentProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-parent-ref');
  expect(parentProps.length).toEqual(1);
  const parentProp = <ParentReferenceSelectEntry>parentProps[0];

  expect(parentProp.projectedName).toEqual('enteredByAnalyst');

  expect(parentProp.parentRowObjectSql.selectEntries.map(e => e.projectedName)).toEqual(
    ['id', 'shortName']
  );
});


test('an inline table\'s own field/expr properties should be included with those of referencing table', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
      parentTables: [
        {
          table: 'compound',
          fieldExpressions: [
            { field: 'id', jsonProperty: 'compoundId' },
            { field: 'display_name', jsonProperty: 'compoundDisplayName' }
          ],
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['id', 'name', 'compoundId', 'compoundDisplayName']
  );
});

test('table field properties from an inlined parent and its own inlined parent should be included properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
      parentTables: [
        {
          // No 'referenceName' property, so compound is an inlined parent table here.
          table: 'compound',
          fieldExpressions: [
            { field: 'id', jsonProperty: 'compoundId' },
            { field: 'display_name', jsonProperty: 'compoundDisplayName' }
          ],
          parentTables: [
            {
              // No 'referenceName' property so analyst is an inlined parent within the inlined compound parent.
              table: 'analyst',
              fieldExpressions: [
                { field: 'short_name', jsonProperty: 'compoundApprovedByAnalystShortName' }
              ],
              viaForeignKeyFields: ['approved_by']
            }
          ]
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['id', 'name', 'compoundId', 'compoundDisplayName', 'compoundApprovedByAnalystShortName']
  );
});

test('field display orders from mixture of base table and parent and child tables should be as expected', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions:
        [
          'id',
          { field: 'name', displayOrder: 3 }
        ],
      parentTables: [
        {
          table: 'analyst',
          referenceName: 'analyst',
          displayOrder: 5,
          fieldExpressions: [{ field: 'short_name', displayOrder: 5 }]
        },
        {
          // No 'referenceName' property, so compound is an inlined parent table here.
          table: 'compound',
          fieldExpressions: [
            { field: 'id', jsonProperty: 'compoundId', displayOrder: 2 },
            { field: 'display_name', jsonProperty: 'compoundDisplayName' }
          ],
          parentTables: [
            {
              // No 'referenceName' property so analyst is an inlined parent within the inlined compound parent.
              table: 'analyst',
              fieldExpressions: [
                { field: 'short_name', jsonProperty: 'approvedBy', displayOrder: 1 }
              ],
              viaForeignKeyFields: ['approved_by']
            }
          ]
        }
      ],
      childTables: [
        {
          collectionName: 'drugReferences',
          displayOrder: 4,
          table: 'drug_reference',
          fieldExpressions: ['reference_id', 'priority'],
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.map(e => [e.projectedName,e.displayOrder]).sort())
  .toEqual([
    ['analyst', 5],
    ['approvedBy', 1],
    ['compoundDisplayName', undefined],
    ['compoundId', 2],
    ['drugReferences', 4],
    ['id', undefined],
    ['name', 3],
  ]);
});

test('a referenced parent table property from an inlined parent should be included properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
      parentTables: [
        {
          // No 'referenceName' property, so compound is an inlined parent table here.
          table: 'compound',
          fieldExpressions: [
            { field: 'id', jsonProperty: 'compoundId' },
            { field: 'display_name', jsonProperty: 'compoundDisplayName' }
          ],
          parentTables: [
            {
              referenceName: 'enteredByAnalyst', // referenced parent
              table: 'analyst',
              fieldExpressions: ['id', 'short_name'],
              viaForeignKeyFields: ['entered_by']
            },
          ],
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['id', 'name', 'compoundId', 'compoundDisplayName', 'enteredByAnalyst']
  );

  const inlParProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-inline-parent-prop');
  expect(inlParProps.length).toEqual(3);
  expect(inlParProps[2].projectedName).toEqual('enteredByAnalyst');
  const analystProp = inlParProps[2] as InlineParentSelectEntry;

  const parentFromEntry = sqlSpec.fromEntries.find(fe => fe.alias === analystProp.parentAlias);
  expect(parentFromEntry?.entryType).toBe('query');
  if (parentFromEntry?.entryType !== 'query') throw new Error('Expected query from entry.');
  const parentSelectEntry = parentFromEntry.query.selectEntries.find(se => se.projectedName === analystProp.projectedName);
  expect(parentSelectEntry?.entryType === 'se-parent-ref');
  if (parentSelectEntry?.entryType !== 'se-parent-ref') throw new Error('Expected parent ref here.');
  const analystSql = (<ParentReferenceSelectEntry>parentSelectEntry).parentRowObjectSql;
  expect(analystSql.selectEntries.map(e => e.projectedName)).toEqual(
    ['id', 'shortName']
  );
});

test('unwrapped child collection of a table field property is represented properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'analyst',
      childTables: [
        {
          collectionName: 'idsOfCompoundsEntered',
          unwrap: true,
          table: 'compound',
          fieldExpressions: ['id'],
          foreignKeyFields: ['entered_by']
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['idsOfCompoundsEntered']
  );

  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(1);
  const childCollProp = childCollProps[0] as ChildCollectionSelectEntry;
  expect(childCollProp.projectedName).toEqual('idsOfCompoundsEntered');
  expect(childCollProp.collectionSql.selectEntries.length).toEqual(1);
  expect(childCollProp.collectionSql.selectEntries[0].projectedName).toEqual('id');
});

test('unwrapped child collection of field expression property is represented properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'analyst',
      childTables: [
        {
          collectionName: 'lowercaseNamesOfCompoundsEntered',
          unwrap: true,
          table: 'compound',
          fieldExpressions: [
            { expression: 'lowercase(display_name)', jsonProperty: 'lcName', fieldTypeInGeneratedSource: 'string' }
          ],
          foreignKeyFields: ['entered_by']
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  expect(sqlSpec.selectEntries.map(e => e.projectedName)).toEqual(
    ['lowercaseNamesOfCompoundsEntered']
  );

  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(1);
  const childCollProp = childCollProps[0] as ChildCollectionSelectEntry;
  expect(childCollProp.collectionSql.objectWrapProperties).toBe(false);
  expect(childCollProp.projectedName).toEqual('lowercaseNamesOfCompoundsEntered');
  expect(childCollProp.collectionSql.selectEntries.length).toEqual(1);
  expect(childCollProp.collectionSql.selectEntries[0].projectedName).toEqual('lcName');
});

test('unwrapped child collection of parent reference property is represented properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugAnalysts',
          unwrap: true,
          table: 'drug',
          parentTables: [
            {
              referenceName: 'registeredBy',
              table: 'analyst',
              fieldExpressions: ['id', 'short_name']
            }
          ],
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(1);
  const childCollProp = childCollProps[0] as ChildCollectionSelectEntry;
  expect(childCollProp.collectionSql.objectWrapProperties).toBe(false);
  expect(childCollProp.projectedName).toEqual('drugAnalysts');
  expect(childCollProp.collectionSql.selectEntries.length).toEqual(1);
  expect(childCollProp.collectionSql.selectEntries[0].projectedName).toEqual('registeredBy');
});



test('unwrapped child collection of inlined parent property is represented properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugRegisteringAnalystIds',
          unwrap: true,
          table: 'drug',
          parentTables: [
            {
              // No reference name, 'analyst' parent properties are inlined with those of 'drug'.
              table: 'analyst',
              fieldExpressions: ['id']
            }
          ]
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(1);
  const childCollProp = childCollProps[0] as ChildCollectionSelectEntry;
  expect(childCollProp.collectionSql.objectWrapProperties).toBe(false);
  expect(childCollProp.projectedName).toEqual('drugRegisteringAnalystIds');
  expect(childCollProp.collectionSql.selectEntries.length).toEqual(1);
  expect(childCollProp.collectionSql.selectEntries[0].projectedName).toEqual('id');
});

test('unwrapped child collection of child collection property is represented properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugAdvisories',
          unwrap: true,
          table: 'drug',
          childTables: [
            {
              collectionName: 'advisories',
              unwrap: false,
              table: 'advisory',
              fieldExpressions: ['id', 'advisory_type_id']
            }
          ],
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(1);
  const childCollProp = childCollProps[0] as ChildCollectionSelectEntry;
  expect(childCollProp.collectionSql.objectWrapProperties).toBe(false);
  expect(childCollProp.projectedName).toEqual('drugAdvisories');
  expect(childCollProp.collectionSql.selectEntries.length).toEqual(1);
  expect(childCollProp.collectionSql.selectEntries[0].projectedName).toEqual('advisories');
});

test('unwrapped child collection of unwrapped child collection property is represented properly', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      childTables: [
        {
          collectionName: 'drugAdvisoryTypeIdLists',
          unwrap: true,
          table: 'drug',
          childTables: [
            {
              collectionName: 'advisoryTypeIds',
              unwrap: true,
              table: 'advisory',
              fieldExpressions: [{ field: 'advisory_type_id', jsonProperty: 'atid' }]
            }
          ]
        }
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(querySpec).get('JSON_OBJECT_ROWS')!;

  const childCollProps = sqlSpec.selectEntries.filter(e => e.entryType === 'se-child-coll');
  expect(childCollProps.length).toEqual(1);
  const childCollProp = childCollProps[0] as ChildCollectionSelectEntry;
  expect(childCollProp.projectedName).toEqual('drugAdvisoryTypeIdLists');
  expect(childCollProp.collectionSql.objectWrapProperties).toBe(false);
  expect(childCollProp.collectionSql.selectEntries.length).toEqual(1);
  expect(childCollProp.collectionSql.selectEntries[0].projectedName).toEqual('advisoryTypeIds');
  expect(childCollProp.collectionSql.selectEntries[0].entryType).toEqual('se-child-coll');
  const advTypeIdsSelEnt = childCollProp.collectionSql.selectEntries[0] as ChildCollectionSelectEntry;
  expect(advTypeIdsSelEnt.collectionSql.selectEntries.map(e => e.projectedName)).toEqual(
    ['atid']
  );
});

test('unwrapped child collection with more than one element property should cause error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      childTables: [
        {
          collectionName: 'advisoryTypeIdLists',
          unwrap: true,
          table: 'drug',
          fieldExpressions: ['id', 'name']
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(
    /unwrapped child collection cannot have multiple field expressions/i
  );
});

test('SQL is generated for each specified result representation', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS', 'JSON_ARRAY_ROW', 'MULTI_COLUMN_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
    }
  };

  const res = sqlSpecGen.generateSqlSpecs(querySpec);
  expect(new Set(res.keys())).toEqual(new Set(['JSON_OBJECT_ROWS', 'JSON_ARRAY_ROW', 'MULTI_COLUMN_ROWS']));
});

test('result representation defaults to JSON_OBJECT_ROWS', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id', 'name'],
    }
  };

  const res = sqlSpecGen.generateSqlSpecs(querySpec);
  expect(new Set(res.keys())).toEqual(new Set(['JSON_OBJECT_ROWS']));
});

test('expression fields must specify json property', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: any =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [{ expression: '2 + 2', fieldTypeInGeneratedSource: 'number' }],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/property name is required/i);
});

test('expression fields must specify field type in generated source', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: any =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [{ expression: '2 + 2', jsonProperty: 'twiceTwo' }],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/field type in generated source must be specified/i);
});

test('a table field/expresion specifying both field and expression values causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: any =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        { field: 'id', expression: '2 + 2', jsonProperty: 'twiceTwo', fieldTypeInGeneratedSource: 'number' }
      ],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/exactly one of 'field' or 'expression'/i);
});

test('a table field/expresion specifying neither field nor expression value causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: any =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        { jsonProperty: 'twiceTwo', fieldTypeInGeneratedSource: 'number' }
      ],
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/exactly one of 'field' or 'expression'/i);
});

test('a non-existent child table causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'references',
          table: 'table_which_dne',
          fieldExpressions: ['id'],
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/table_which_dne/i);
});

test('a non-existent parent table causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      parentTables: [
        {
          table: 'table_which_dne',
          fieldExpressions: ['id'],
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/table_which_dne/i);
});

test('a missing foreign key for a child collection causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'references',
          table: 'reference',
          fieldExpressions: ['id'],
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/no foreign key found/i);
});

test('a missing foreign key to parent table causes error', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      parentTables: [
        {
          table: 'reference',
          fieldExpressions: ['id'],
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/no foreign key found/i);
});

test('foreign key fields must be provided when multiple fk constraints exist for a child collection', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'analyst',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'compounds', // compounds has multiple fks to analyst (for entered_by and approved_by)
          table: 'compound',
          fieldExpressions: ['id'],
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/multiple foreign key constraints exist/i);
});

test('providing foreign key fields avoids error when multiple fk constraints exist for child collection', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'analyst',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'compounds', // compounds has multiple fks to analyst (for entered_by and approved_by)
          table: 'compound',
          fieldExpressions: ['id'],
          foreignKeyFields: ['entered_by'] // disambiguates
        }
      ]
    }
  };

  expect(sqlSpecGen.generateSqlSpecs(querySpec).size).toBe(1);
});

test('a custom match condition for a child table may be used when no suitable foreign key exists', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'references',
          table: 'reference',
          fieldExpressions: ['id'],
          customMatchCondition: { equatedFields: [{ childField: 'id', parentPrimaryKeyField: 'id' }] }
        }
      ]
    }
  };

  expect(sqlSpecGen.generateSqlSpecs(querySpec).size).toBe(1);
});

test('a custom match condition for a child table can only utilize fields which exist in database metadata', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      childTables: [
        {
          collectionName: 'references',
          table: 'reference',
          fieldExpressions: ['id'],
          customMatchCondition: { equatedFields: [{ childField: 'id', parentPrimaryKeyField: 'field_which_dne' }] }
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec).size).toThrowError(/field_which_dne/i);
});

test('foreign key fields must be provided when multiple fk constraints exist to a parent table', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      fieldExpressions: ['id'],
      parentTables: [
        {
          table: 'analyst',
          fieldExpressions: ['id'],
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec)).toThrowError(/multiple foreign key constraints exist/i);
});

test('providing fk fields avoids error when multiple fk constraints exist with a parent table', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'compound',
      fieldExpressions: ['id'],
      parentTables: [
        {
          table: 'analyst',
          fieldExpressions: ['id'],
          viaForeignKeyFields: ['entered_by'] // disambiguates
        }
      ]
    }
  };

  expect(sqlSpecGen.generateSqlSpecs(querySpec).size).toBe(1);
});

test('a custom match condition for a parent table may be used when no suitable foreign key exists', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      parentTables: [
        {
          table: 'reference',
          fieldExpressions: ['id'],
          customMatchCondition: { equatedFields: [{ childField: 'id', parentPrimaryKeyField: 'id' }] }
        }
      ]
    }
  };

  expect(sqlSpecGen.generateSqlSpecs(querySpec).size).toBe(1);
});

test('a custom match condition for a parent table can only utilize fields which exist in database metadata', () => {
  const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);
  const querySpec: QuerySpec =
  {
    queryName: 'test query',
    resultRepresentations: ['JSON_OBJECT_ROWS'],
    tableJson: {
      table: 'drug',
      fieldExpressions: ['id'],
      parentTables: [
        {
          table: 'reference',
          fieldExpressions: ['id'],
          customMatchCondition: { equatedFields: [{ childField: 'field_which_dne', parentPrimaryKeyField: 'id' }] }
        }
      ]
    }
  };

  expect(() => sqlSpecGen.generateSqlSpecs(querySpec).size).toThrowError(/field_which_dne/i);
});
