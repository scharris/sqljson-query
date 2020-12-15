import {TableJsonSpec} from "../query-specs";
import {propertyNameDefaultFunction} from "../util";
import {DatabaseMetadata} from '../database-metadata';
import {ResultTypesGenerator} from "../result-types-generator";

const dbmdStoredProps = require('./resources/dbmd.json');
const dbmd = new DatabaseMetadata(dbmdStoredProps);
const ccPropNameFn = propertyNameDefaultFunction("CAMELCASE");
const resTypesGen = new ResultTypesGenerator(dbmd, 'drugs', ccPropNameFn);

test('table referenced in spec must exist', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "table_which_dne",
      fieldExpressions: [
        {
          "field": "name",
          "jsonProperty": "tName"
        },
        "description"
      ]
    };
  expect(() =>resTypesGen.generateResultTypes(tableJsonSpec, 'test query')).toThrowError(/table_which_dne/);
});

test('fields referenced in spec must exist', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: [
        {
          "field": "field_which_dne",
          "jsonProperty": "dneFieldProp"
        },
        "description"
      ]
    };
  expect(() =>resTypesGen.generateResultTypes(tableJsonSpec, 'test query')).toThrowError(/field_which_dne/);
});

test('a single result type is generated for a table spec with no parent/child specs', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["name"]
    };
  expect(resTypesGen.generateResultTypes(tableJsonSpec, 'test query').length).toBe(1);
});

test('the result type name is camelcased form of the table name', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug_reference",
      fieldExpressions: ["drug_id"]
    };
  expect(resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0].typeName).toBe('DrugReference');
});

test('simple table field property names should be as specified by jsonProperty where provided', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: [
        {
          "field": "name",
          "jsonProperty": "tName"
        },
        {
          "field": "compound_id",
          "jsonProperty": "compoundIdentifier"
        }
      ]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .simpleTableFieldProperties.map(p => p.name)
  ).toEqual(['tName', 'compoundIdentifier']);
});

test('simple table field property names should default according to provided function', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "drug",
      fieldExpressions: ["name", "compound_id"]
    };
  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')[0]
    .simpleTableFieldProperties.map(p => p.name)
  ).toEqual(['name', 'compoundId']);
});

test('Child table types are listed after the top-level result type', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "analyst",
      fieldExpressions: [ "id" ],
      childTables: [
        {
          collectionName: "compoundsEntered",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id" ],
          },
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: "drugs",
          tableJson: {
            table: "drug",
            fieldExpressions: [ "id" ],
          },
        }
      ]
    };

  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')
    .map(rt => rt.typeName)
  ).toEqual(['Analyst', 'Compound', 'Drug']);
});

test('No result type is generated for an unwrapped child collection', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "analyst",
      fieldExpressions: [ "id" ],
      childTables: [
        {
          collectionName: "enteredCompoundIds",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id" ],
          },
          foreignKeyFields: ['entered_by']
        }
      ]
    };

  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')
    .map(rt => rt.typeName)
  ).toEqual(['Analyst']);
});


test('Identical result types for two child table collections are covered by one generated result type', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "analyst",
      fieldExpressions: [ "id" ],
      childTables: [
        {
          collectionName: "compoundsEntered",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id" ],
          },
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: "compoundsApproved",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id" ],
          },
          foreignKeyFields: ['approved_by']
        },
      ]
    };

  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'failing test')
    .map(rt => rt.typeName)
  ).toEqual(['Analyst', 'Compound']);
});
/*
test('Identical result types for two child table collections are covered by one generated result type', () => {
  const tableJsonSpec: TableJsonSpec = {
      table: "analyst",
      fieldExpressions: [ "id" ],
      childTables: [
        {
          collectionName: "compoundsEntered",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id" ],
          },
          foreignKeyFields: ['entered_by']
        },
        {
          collectionName: "compoundsApproved",
          tableJson: {
            table: "compound",
            fieldExpressions: [ "id", "name" ],
          },
          foreignKeyFields: ['approved_by']
        },
      ],
    };

  expect(
    resTypesGen.generateResultTypes(tableJsonSpec, 'test query')
    .map(rt => rt.typeName)
  ).toEqual(['Analyst', 'Compound', 'Compound_1']);
});
*/