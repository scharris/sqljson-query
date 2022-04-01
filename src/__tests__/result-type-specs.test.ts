import {ResultTypeSpec, resultTypeSpecsEqual} from '../result-type-generation';

const table = { name: 'table' };

const emptyResultTypeSpec: ResultTypeSpec = {
  table,
  properties: [],
  unwrapped: false
};

function makeExampleResultTypeSpec(): ResultTypeSpec
{
  return {
    table,
    properties: [
      { type: 'rtp-field', propertyName: 'fieldA1', databaseFieldName: 'field_a1', databaseType: 'varchar',
        length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null },
      { type: 'rtp-field', propertyName: 'fieldA2', databaseFieldName: 'field_a2', databaseType: 'varchar',
        length: 2, precision: 0, fractionalDigits: 0, nullable: true, specifiedSourceCodeFieldType: null },
      { type: 'rtp-expr', propertyName: 'fieldB1', fieldExpression: "1+1", specifiedSourceCodeFieldType: null },
      { type: 'rtp-expr', propertyName: 'fieldB2', fieldExpression: "2+1", specifiedSourceCodeFieldType: null },
      { type: 'rtp-expr', propertyName: 'fieldB3', fieldExpression: "3+1", specifiedSourceCodeFieldType: "int" },
      { type: 'rtp-parent-ref',
        propertyName: 'fieldC1',
        refResultType: { table, properties: [], unwrapped: false },
        nullable: true
      },
      {
        type: 'rtp-child-coll',
        propertyName: 'fieldD1',
        elResultType: { table, properties: [], unwrapped: false },
        nullable: true
      }
    ],
    unwrapped: false
  };
}

const exampleResultTypeSpec = makeExampleResultTypeSpec();

test('result types equality', () => {

  expect(resultTypeSpecsEqual(exampleResultTypeSpec, exampleResultTypeSpec)).toBe(true);

  expect(resultTypeSpecsEqual(exampleResultTypeSpec, makeExampleResultTypeSpec())).toBe(true);

  expect(resultTypeSpecsEqual(exampleResultTypeSpec, {...exampleResultTypeSpec, table: { name: "other_table" }})).toBe(false);

  expect(
    resultTypeSpecsEqual(
      exampleResultTypeSpec,
      {
        ...exampleResultTypeSpec,
        properties:
          exampleResultTypeSpec.properties.map(p => ({...p, name: p.propertyName + "_2"}))
      }
    )).toBe(false);

});
