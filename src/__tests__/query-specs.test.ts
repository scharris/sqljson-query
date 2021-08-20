import {getInlineParentSpecs, getReferencedParentSpecs, TableJsonSpec} from "../query-specs";

const parent1Spec: TableJsonSpec = {
  table: "parent1",
  fieldExpressions: [
    {
      "field": "name",
      "jsonProperty": "parent1Name"
    },
    "description"
  ]
};

const parent2Spec: TableJsonSpec = {
  table: "parent2",
  fieldExpressions: [
    {
      "field": "id",
      "jsonProperty": "parent2Id"
    }
  ]
};

const parent3Spec: TableJsonSpec = {
  table: "parent3",
  fieldExpressions: [
    {
      "field": "id",
      "jsonProperty": "parent3Id"
    }
  ]
};

test('get non-empty inline parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      parent1Spec,
      { ...parent2Spec, referenceName: "parent2Ref" },
      { ...parent3Spec, referenceName: "parent3Ref" },
    ]
  };
  expect(getInlineParentSpecs(tableJsonSpec)).toEqual([parent1Spec]);
});

test('get empty inline parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      { ...parent2Spec, referenceName: "parent2Ref" },
      { ...parent3Spec, referenceName: "parent3Ref" },
    ]
  };
  expect(getInlineParentSpecs(tableJsonSpec)).toEqual([]);
  expect(getInlineParentSpecs({table: "empty"})).toEqual([]);
});

test('get non-empty referenced parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      parent1Spec,
      { ...parent2Spec, referenceName: "parent2Ref" },
      { ...parent3Spec, referenceName: "parent3Ref" },
    ]
  };

  expect(getReferencedParentSpecs(tableJsonSpec)).toEqual([
    {...parent2Spec, referenceName: "parent2Ref" },
    {...parent3Spec, referenceName: "parent3Ref" }
  ]);
});

test('get empty referenced parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      parent1Spec,
    ]
  };
  expect(getReferencedParentSpecs(tableJsonSpec)).toEqual([]);
  expect(getReferencedParentSpecs({table: "empty"})).toEqual([]);
});
