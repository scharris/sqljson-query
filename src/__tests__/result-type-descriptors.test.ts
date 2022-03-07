import {propertiesCount, ResultTypeDescriptor, resultTypeDecriptorsEqual} from '../result-type-gen';

const emptyResultTypeDesc: ResultTypeDescriptor = {
  queryName: 'query',
  table: 'table',
  tableFieldProperties: [],
  tableExpressionProperties: [],
  parentReferenceProperties: [],
  childCollectionProperties: [],
  unwrapped: false
};

function makeExampleResultTypeDescriptor(): ResultTypeDescriptor
{
  return {
    queryName: 'query',
    table: 'table',
    tableFieldProperties: [
      {name: 'fieldA1', databaseFieldName: 'field_a1', databaseType: 'varchar', length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null},
      {name: 'fieldA2', databaseFieldName: 'field_a2', databaseType: 'varchar', length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null}
    ],
    tableExpressionProperties: [
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
          tableExpressionProperties: [],
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
          tableExpressionProperties: [],
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

const exampleResultTypeDesc = makeExampleResultTypeDescriptor();

test('result type fields counts', () => {
  expect(propertiesCount(emptyResultTypeDesc)).toBe(0);
  expect(propertiesCount(exampleResultTypeDesc)).toBe(7);
});

test('result types equality', () => {
  
  expect(resultTypeDecriptorsEqual(exampleResultTypeDesc, exampleResultTypeDesc)).toBe(true);

  const exampleCopy = makeExampleResultTypeDescriptor();
  expect(resultTypeDecriptorsEqual(exampleResultTypeDesc, exampleCopy)).toBe(true);
  
  expect(resultTypeDecriptorsEqual(exampleResultTypeDesc, {...exampleResultTypeDesc, table: "other_table"})).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDesc,
      {
        ...exampleResultTypeDesc, 
        tableFieldProperties:
          exampleResultTypeDesc.tableFieldProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDesc,
      {
        ...exampleResultTypeDesc, 
        tableExpressionProperties: 
          exampleResultTypeDesc.tableExpressionProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDesc,
      {
        ...exampleResultTypeDesc, 
        parentReferenceProperties: 
          exampleResultTypeDesc.parentReferenceProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDesc,
      {
        ...exampleResultTypeDesc, 
        childCollectionProperties: 
          exampleResultTypeDesc.childCollectionProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDesc,
      {...exampleResultTypeDesc, unwrapped: !exampleResultTypeDesc.unwrapped}
    )).toBe(false);
});
