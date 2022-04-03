import path from 'path';
import { DatabaseMetadata } from '../dbmd';
import { QuerySpec } from '../query-specs';
import { makeNamedResultTypeSpecs } from '../result-type-generation';
import { SqlSpecGenerator } from '../sql-generation';
import { readTextFileSync } from '../util/files';
import { propertyNameDefaultFunction } from '../util/property-names';

const dbmdPath = path.join(__dirname, 'db', 'mysql', 'dbmd.json');
const dbmdStoredProps = JSON.parse(readTextFileSync(dbmdPath));
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction('CAMELCASE', dbmd.caseSensitivity);
const sqlSpecGen = new SqlSpecGenerator(dbmd, 'drugs', ccPropNameFn);

/*
const drugsQuery: QuerySpec = {
  queryName: 'full drugs test query',
  resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
  generateResultTypes: true,
  tableJson: {
    table: 'drug',
    fieldExpressions: [
      'id',
      'name',
      { field: 'descr', jsonProperty: 'description' },
      { field: 'category_code', jsonProperty: 'category' },
      'mesh_id',
      'cid',
      'registered',
      'market_entry_date',
      'therapeutic_indications',
      {
        expression: '$$.cid + 1000',
        jsonProperty: 'cidPlus1000',
        fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'}
      },
    ],
    childTables: [
      {
        collectionName: 'prioritizedReferences',
        table: 'drug_reference',
        fieldExpressions: [ 'priority' ],
        parentTables: [
          {
            table: 'reference',
            fieldExpressions: [ 'publication' ]
          }
        ],
        orderBy: 'priority asc'
      },
      {
        collectionName: 'brands',
        table: 'brand',
        fieldExpressions: [ 'brand_name' ],
        parentTables: [
          {
            table: 'manufacturer',
            fieldExpressions: [{ field: 'name', jsonProperty: 'manufacturer' }]
          }
        ]
      },
      {
        collectionName: 'advisories',
        table: 'advisory',
        fieldExpressions: [{ field: 'text', jsonProperty: 'advisoryText' }],
        parentTables: [
          {
            table: 'advisory_type',
            fieldExpressions: [
              { field: 'name', jsonProperty: 'advisoryType' },
              {
                expression: '(1 + 1)',
                jsonProperty: 'exprYieldingTwo',
                fieldTypeInGeneratedSource: {TS: 'number', Java: 'int'}
              },
            ],
            parentTables: [
              {
                table: 'authority',
                fieldExpressions: [
                  { field: 'name', jsonProperty: 'authorityName' },
                  { field: 'url', jsonProperty: 'authorityUrl' },
                  { field: 'description', jsonProperty: 'authorityDescription' },
                ]
              }
            ]
          }
        ]
      },
      {
        collectionName: 'functionalCategories',
        table: 'drug_functional_category',
        parentTables: [
          {
            table: 'functional_category',
            fieldExpressions: [
              { field: 'name', jsonProperty: 'categoryName' },
              'description',
            ]
          },
          {
            table: 'authority',
            fieldExpressions: [
              { field: 'name', jsonProperty: 'authorityName' },
              { field: 'url', jsonProperty: 'authorityUrl' },
              { field: 'description', jsonProperty: 'authorityDescription' },
            ]
          }
        ]
      }
    ],
    parentTables: [
      {
        referenceName: 'registeredByAnalyst',
        table: 'analyst',
        fieldExpressions: [ 'id', 'short_name' ]
      },
      {
        referenceName: 'compound',
        viaForeignKeyFields: [
          'compound_id'
        ],
        table: 'compound',
        fieldExpressions: [ 'display_name', 'nctr_isis_id', 'cas', 'entered' ],
        parentTables: [
          {
            referenceName: 'enteredByAnalyst',
            table: 'analyst',
            fieldExpressions: [ 'id', 'short_name' ],
            viaForeignKeyFields: [ 'entered_by' ]
          },
          {
            referenceName: 'approvedByAnalyst',
            table: 'analyst',
            fieldExpressions: [ 'id', 'short_name' ],
            viaForeignKeyFields: [ 'approved_by' ]
          }
        ]
      }
    ],
    recordCondition: { sql: "$$.id > 1" }
  },
  orderBy: '$$.name'
};
*/

test('Direct table field expressions are named properly.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        'id',
        'name',
        { field: 'descr', jsonProperty: 'description' },
        { field: 'category_code', jsonProperty: 'category' },
        'mesh_id',
        'cid',
        'registered',
        'market_entry_date',
        'therapeutic_indications',
        {
          expression: '$$.cid + 1000',
          jsonProperty: 'cidPlus1000',
          fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'}
        },
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  expect(resultTypes.length).toBe(1);
  const drugResType = resultTypes[0];
  expect(drugResType.properties.map(rt => rt.propertyName)).toEqual([
    'id',
    'name',
    'description',
    'category',
    'meshId',
    'cid',
    'registered',
    'marketEntryDate',
    'therapeuticIndications',
    'cidPlus1000',
  ]);
});

test('Direct table field expressions have proper nullability.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      fieldExpressions: [
        'id',
        'name',
        'compound_id',
        { field: 'descr', jsonProperty: 'description' },
        { field: 'category_code', jsonProperty: 'category' },
        'mesh_id',
        'cid',
        'registered',
        'market_entry_date',
        'therapeutic_indications',
        {
          expression: '$$.cid + 1000',
          jsonProperty: 'cidPlus1000',
          fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'}
        },
      ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  expect(resultTypes.length).toBe(1);
  const drugResType = resultTypes[0];

  expect(drugResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', false],
    ['name', false],
    ['compoundId', false],
    ['description', true],
    ['category', false],
    ['meshId', true],
    ['cid', true],
    ['registered', true],
    ['marketEntryDate', true],
    ['therapeuticIndications', true],
    ['cidPlus1000', undefined],
  ]);
});

test('Direct parent reference property based on non-nullable fk field is not nullable.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      parentTables: [
        {
          referenceName: 'registeredByAnalyst',
          table: 'analyst',
          fieldExpressions: [ 'id', 'short_name' ]
        },
      ],
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const drugResType = resultTypes[0];

  expect(drugResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['registeredByAnalyst', false],
  ]);
});

test('Direct parent reference property based on nullable fk field is nullable.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'compound',
        parentTables: [
          {
            referenceName: 'approvedByAnalyst',
            table: 'analyst',
            fieldExpressions: [ 'id', 'short_name' ],
            viaForeignKeyFields: [ 'approved_by' ]
          }
        ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const compoundResType = resultTypes[0];

  expect(compoundResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['approvedByAnalyst', true],
  ]);
});

test('Direct parent reference objects based on non-nullable fk have properties with proper nullability.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      parentTables: [
        {
          referenceName: 'compound',
          table: 'compound',
          fieldExpressions: [ 'id', 'display_name' ]
        },
      ],
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const compoundResType = resultTypes[1];

  expect(compoundResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', false],
    ['displayName', true],
  ]);
});

test('Direct parent reference objects based on nullable fk have properties with proper nullability.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'compound',
        parentTables: [
          {
            referenceName: 'approvedByAnalyst',
            table: 'analyst',
            fieldExpressions: [ 'id', 'short_name' ],
            viaForeignKeyFields: [ 'approved_by' ]
          }
        ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const analystResType = resultTypes[1];

  expect(analystResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', false],
    ['shortName', false],
  ]);
});

test('Direct child collection property is not nullable.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'compound',
        childTables: [
          {
            collectionName: 'drugs',
            table: 'drug',
            fieldExpressions: [ 'id' ]
          }
        ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const compoundResType = resultTypes[0];

  expect(compoundResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['drugs', false],
  ]);
});


test('Direct child collection element object fields have proper nullability.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'compound',
        childTables: [
          {
            collectionName: 'drugs',
            table: 'drug',
            fieldExpressions: [
              'id',
              'name',
              'compound_id',
              { field: 'descr', jsonProperty: 'description' },
              { field: 'category_code', jsonProperty: 'category' },
              'mesh_id',
              'cid',
              'registered',
              'market_entry_date',
              'therapeutic_indications',
              {
                expression: '$$.cid + 1000',
                jsonProperty: 'cidPlus1000',
                fieldTypeInGeneratedSource: {TS: 'number | null', Java: '@Nullable Long'}
              },
            ]
          }
        ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const drugResType = resultTypes[1];

  expect(drugResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', false],
    ['name', false],
    ['compoundId', false],
    ['description', true],
    ['category', false],
    ['meshId', true],
    ['cid', true],
    ['registered', true],
    ['marketEntryDate', true],
    ['therapeuticIndications', true],
    ['cidPlus1000', undefined],
  ]);
});

test('An inline parent entry does not itself have a generated result type.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      parentTables: [
        {
          table: 'compound',
          fieldExpressions: [ 'id', 'display_name' ]
        },
      ],
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  expect(resultTypes.map(rt => rt.resultTypeName)).toEqual(['Drug']);
});

test('Table fields obtained through an inline parent via non-nullable fk have their original nullability.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      parentTables: [
        {
          table: 'compound',
          fieldExpressions: [ 'id', 'display_name' ]
        },
      ],
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const drugResType = resultTypes[0];

  expect(drugResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', false],
    ['displayName', true],
  ]);
});

test('Table fields obtained through an inline parent via nullable fk are nullable.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'compound',
        parentTables: [
          {
            table: 'analyst',
            fieldExpressions: [ 'id', 'short_name' ],
            viaForeignKeyFields: [ 'approved_by' ]
          }
        ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const compoundResType = resultTypes[0];

  expect(compoundResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', true],
    ['shortName', true],
  ]);
});

test('Table fields obtained through an inline parent with a record condition are nullable.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      parentTables: [
        {
          table: 'compound',
          fieldExpressions: [ 'id', 'display_name' ],
          recordCondition: { sql: '$$.id <> 1' }
        },
      ],
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  const drugResType = resultTypes[0];

  expect(drugResType.properties.map(rt => [rt.propertyName, rt.nullable])).toEqual([
    ['id', true],
    ['displayName', true],
  ]);
});

test('Result type name for simple table is assigned properly.', async () => {
  const query: QuerySpec = {
    queryName: 'full drugs test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      fieldExpressions: [ 'id' ]
    }
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);

  expect(resultTypes.map(rt => rt.resultTypeName)).toEqual([
    'Drug',
  ]);
});

test('Result type names are assigned properly when structurally equal types occur at multiple parts of a query.', async () => {
  const query: QuerySpec = {
    queryName: 'test query',
    resultRepresentations: [ 'JSON_OBJECT_ROWS' ],
    generateResultTypes: true,
    tableJson: {
      table: 'drug',
      parentTables: [
        {
          referenceName: 'registeredByAnalyst',
          table: 'analyst',
          fieldExpressions: [ 'id', 'short_name' ]
        },
        {
          referenceName: 'compound',
          viaForeignKeyFields: [
            'compound_id'
          ],
          table: 'compound',
          parentTables: [
            {
              referenceName: 'enteredByAnalyst',
              table: 'analyst',
              fieldExpressions: [ 'id', 'short_name' ],
              viaForeignKeyFields: [ 'entered_by' ]
            },
            {
              referenceName: 'approvedByAnalyst',
              table: 'analyst',
              fieldExpressions: [ 'id', 'short_name' ],
              viaForeignKeyFields: [ 'approved_by' ]
            }
          ]
        }
      ],
    },
  };

  const sqlSpec = sqlSpecGen.generateSqlSpecs(query).get('JSON_OBJECT_ROWS')!;
  const resultTypes = makeNamedResultTypeSpecs(sqlSpec);
  const typeNames = new Set(resultTypes.map(rt => rt.resultTypeName));
  expect(typeNames).toEqual(new Set([
    'Drug',
    'Compound',
    'Analyst',
  ]));
});
