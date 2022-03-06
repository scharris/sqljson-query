import {propertiesCount, ResultTypeDescriptor, resultTypeDecriptorsEqual} from '../result-type-descriptors';

const emptyResultTypeDescr: ResultTypeDescriptor = {
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

const exampleResultTypeDescr = makeExampleResultTypeDescriptor();

test('result type fields counts', () => {
  expect(propertiesCount(emptyResultTypeDescr)).toBe(0);
  expect(propertiesCount(exampleResultTypeDescr)).toBe(7);
});

test('result types equality', () => {
  
  expect(resultTypeDecriptorsEqual(exampleResultTypeDescr, exampleResultTypeDescr)).toBe(true);

  const exampleCopy = makeExampleResultTypeDescriptor();
  expect(resultTypeDecriptorsEqual(exampleResultTypeDescr, exampleCopy)).toBe(true);
  
  expect(resultTypeDecriptorsEqual(exampleResultTypeDescr, {...exampleResultTypeDescr, table: "other_table"})).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDescr,
      {
        ...exampleResultTypeDescr, 
        tableFieldProperties:
          exampleResultTypeDescr.tableFieldProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDescr,
      {
        ...exampleResultTypeDescr, 
        tableExpressionProperties: 
          exampleResultTypeDescr.tableExpressionProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDescr,
      {
        ...exampleResultTypeDescr, 
        parentReferenceProperties: 
          exampleResultTypeDescr.parentReferenceProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDescr,
      {
        ...exampleResultTypeDescr, 
        childCollectionProperties: 
          exampleResultTypeDescr.childCollectionProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )).toBe(false);

  expect(
    resultTypeDecriptorsEqual(
      exampleResultTypeDescr,
      {...exampleResultTypeDescr, unwrapped: !exampleResultTypeDescr.unwrapped}
    )).toBe(false);
});
