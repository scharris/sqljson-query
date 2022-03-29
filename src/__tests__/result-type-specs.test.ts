import {propertiesCount, ResultTypeSpec, resultTypeSpecsEqual} from '../result-type-generation';

const emptyResultTypeSpec: ResultTypeSpec = {
  queryName: 'query',
  table: 'table',
  tableFieldProperties: [],
  tableExpressionProperties: [],
  parentReferenceProperties: [],
  childCollectionProperties: [],
  unwrapped: false
};

function makeExampleResultTypeSpec(): ResultTypeSpec
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

const exampleResultTypeSpec = makeExampleResultTypeSpec();

test('result type fields counts', () => {
  expect(propertiesCount(emptyResultTypeSpec)).toBe(0);
  expect(propertiesCount(exampleResultTypeSpec)).toBe(7);
});

test('result types equality', () => {

  expect(resultTypeSpecsEqual(exampleResultTypeSpec, exampleResultTypeSpec)).toBe(true);

  const exampleCopy = makeExampleResultTypeSpec();
  expect(resultTypeSpecsEqual(exampleResultTypeSpec, exampleCopy)).toBe(true);

  expect(resultTypeSpecsEqual(exampleResultTypeSpec, {...exampleResultTypeSpec, table: "other_table"})).toBe(false);

  expect(
    resultTypeSpecsEqual(
      exampleResultTypeSpec,
      {
        ...exampleResultTypeSpec,
        tableFieldProperties:
          exampleResultTypeSpec.tableFieldProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )).toBe(false);

  expect(
    resultTypeSpecsEqual(
      exampleResultTypeSpec,
      {
        ...exampleResultTypeSpec,
        tableExpressionProperties:
          exampleResultTypeSpec.tableExpressionProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )).toBe(false);

  expect(
    resultTypeSpecsEqual(
      exampleResultTypeSpec,
      {
        ...exampleResultTypeSpec,
        parentReferenceProperties:
          exampleResultTypeSpec.parentReferenceProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )).toBe(false);

  expect(
    resultTypeSpecsEqual(
      exampleResultTypeSpec,
      {
        ...exampleResultTypeSpec,
        childCollectionProperties:
          exampleResultTypeSpec.childCollectionProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )).toBe(false);

  expect(
    resultTypeSpecsEqual(
      exampleResultTypeSpec,
      {...exampleResultTypeSpec, unwrapped: !exampleResultTypeSpec.unwrapped}
    )).toBe(false);
});
