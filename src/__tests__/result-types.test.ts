import {assertEquals, assert} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {propertiesCount, ResultType, resultTypesEqual} from '../result-types.ts';

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

Deno.test('result type fields counts', () => {
  assertEquals(propertiesCount(emptyResultType), 0);
  assertEquals(propertiesCount(exampleResultType), 7);
});

Deno.test('result types equality', () => {
  
  assertEquals(resultTypesEqual(exampleResultType, exampleResultType), true);

  const exampleCopy = makeExampleResultType();
  assert(resultTypesEqual(exampleResultType, exampleCopy));
  
  assertEquals(resultTypesEqual(exampleResultType, {...exampleResultType, table: "other_table"}), false);

  assertEquals(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        tableFieldProperties:
          exampleResultType.tableFieldProperties.map(p => ({...p, name: p.name + "_2"}))
      }
    )
  , false);

  assertEquals(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        tableExpressionProperty: 
          exampleResultType.tableExpressionProperty.map(p => ({...p, name: p.name + "_2"})) 
      }
    )
  , false);

  assertEquals(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        parentReferenceProperties: 
          exampleResultType.parentReferenceProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )
  , false);

  assertEquals(
    resultTypesEqual(
      exampleResultType,
      {
        ...exampleResultType, 
        childCollectionProperties: 
          exampleResultType.childCollectionProperties.map(p => ({...p, name: p.name + "_2"})) 
      }
    )
  , false);

  assertEquals(
    resultTypesEqual(
      exampleResultType,
      {...exampleResultType, unwrapped: !exampleResultType.unwrapped}
    )
  , false);
  
});
