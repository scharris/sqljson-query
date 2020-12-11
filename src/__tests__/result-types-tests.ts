import {fieldsCount, ResultType, resultTypesEqual} from '../result-types';

const emptyResultType: ResultType = {
  queryName: 'query',
  table: 'table',
  typeName: 'Table',
  simpleTableFieldProperties: [],
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
    typeName: 'Table',
    simpleTableFieldProperties: [
      {name: 'fieldA1', databaseType: 'varchar', length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null},
      {name: 'fieldA2', databaseType: 'varchar', length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null}
    ],
    tableExpressionProperty: [
      {name: 'fieldB1', fieldExpression: "1+1", specifiedSourceCodeFieldType: null},
      {name: 'fieldB2', fieldExpression: "2+1", specifiedSourceCodeFieldType: null},
      {name: 'fieldB3', fieldExpression: "3+1", specifiedSourceCodeFieldType: "int"},
    ],
    parentReferenceProperties: [
      {
        name: 'fieldC1', 
        resultType: {
          queryName: 'query',
          table: 'table',
          typeName: 'Table',
          simpleTableFieldProperties: [],
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
        resultType: {
          queryName: 'query',
          table: 'table',
          typeName: 'Table',
          simpleTableFieldProperties: [],
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
  expect(fieldsCount(emptyResultType)).toBe(0);
  expect(fieldsCount(exampleResultType)).toBe(7);
});

test('result types equality', () => {
  
  expect(resultTypesEqual(exampleResultType, exampleResultType, true)).toBe(true);

  const exampleCopy = makeExampleResultType();
  expect(resultTypesEqual(exampleResultType, exampleCopy, true)).toBe(true);
  expect(resultTypesEqual(exampleResultType, exampleCopy, false)).toBe(true);
  
  const equivResType = {...exampleResultType, typeName: "OtherTypeName"};
  expect(resultTypesEqual(exampleResultType, equivResType, true)).toBe(true);
  expect(resultTypesEqual(exampleResultType, equivResType, false)).toBe(false);
  
  expect(resultTypesEqual(exampleResultType, {...exampleResultType, table: "other_table"}, true)).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        simpleTableFieldProperties: 
          exampleResultType.simpleTableFieldProperties.map(p => ({...p, name: p.name + "_2"})) 
      },
      false
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        tableExpressionProperty: 
          exampleResultType.tableExpressionProperty.map(p => ({...p, name: p.name + "_2"})) 
      },
      false
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        parentReferenceProperties: 
          exampleResultType.parentReferenceProperties.map(p => ({...p, name: p.name + "_2"})) 
      },
      false
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        childCollectionProperties: 
          exampleResultType.childCollectionProperties.map(p => ({...p, name: p.name + "_2"})) 
      },
      false
    )
  ).toBe(false);

  expect(
    resultTypesEqual(
      exampleResultType,
      {...exampleResultType, unwrapped: !exampleResultType.unwrapped},
      false
    )
  ).toBe(false);
  
});
