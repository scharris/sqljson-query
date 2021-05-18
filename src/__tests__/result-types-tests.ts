import {propertiesCount, ResultType, resultTypesEqual} from '../result-types';

const emptyResultType: ResultType = {
  queryName: 'query',
  table: 'table',
  tableFieldProperties: [],
  tableExpressionProperty: [],
  parentReferenceProperties: [],
  childCollectionProperties: [],
  unwrapped: false
};

function makeExampleResultType(): ResultType
{
  return {
    queryName: 'query',
    table: 'table',
    tableFieldProperties: [
      {name: 'fieldA1', databaseFieldName: 'field_a1', databaseType: 'varchar', length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null},
      {name: 'fieldA2', databaseFieldName: 'field_a2', databaseType: 'varchar', length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null}
    ],
    tableExpressionProperty: [
      {name: 'fieldB1', fieldExpression: "1+1", specifiedSourceCodeFieldType: null},
      {name: 'fieldB2', fieldExpression: "2+1", specifiedSourceCodeFieldType: null},
      {name: 'fieldB3', fieldExpression: "3+1", specifiedSourceCodeFieldType: "int"},
    ],
    parentReferenceProperties: [
      {
        name: 'fieldC1', 
        refResultType: {
          queryName: 'query',
          table: 'table',
          tableFieldProperties: [],
          tableExpressionProperty: [],
          parentReferenceProperties: [],
          childCollectionProperties: [],
          unwrapped: false
        },
        nullable: true
      }
    ],
    childCollectionProperties: [
      {
        name: 'fieldD1', 
        elResultType: {
          queryName: 'query',
          table: 'table',
          tableFieldProperties: [],
          tableExpressionProperty: [],
          parentReferenceProperties: [],
          childCollectionProperties: [],
          unwrapped: false
        },
        nullable: true
      }
    ],
    unwrapped: false
  };
}

const exampleResultType = makeExampleResultType();

test('result type fields counts', () => {
  expect(propertiesCount(emptyResultType)).toBe(0);
  expect(propertiesCount(exampleResultType)).toBe(7);
});

test('result types equality', () => {
  
  expect(resultTypesEqual(exampleResultType, exampleResultType)).toBe(true);

  const exampleCopy = makeExampleResultType();
  expect(resultTypesEqual(exampleResultType, exampleCopy)).toBe(true);
  
  expect(resultTypesEqual(exampleResultType, {...exampleResultType, table: "other_table"})).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        tableFieldProperties:
          exampleResultType.tableFieldProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        tableExpressionProperty: 
          exampleResultType.tableExpressionProperty.map(p => ({...p, name: p.name + "_2"})) 
      }
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        parentReferenceProperties: 
          exampleResultType.parentReferenceProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        childCollectionProperties: 
          exampleResultType.childCollectionProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {...exampleResultType, unwrapped: !exampleResultType.unwrapped}
    )
  ).toBe(false);
  
});
