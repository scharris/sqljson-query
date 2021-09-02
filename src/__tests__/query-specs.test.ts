import {assertEquals} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {getInlineParentSpecs, getReferencedParentSpecs, TableJsonSpec} from "../query-specs.ts";

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

Deno.test('get non-empty inline parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      parent1Spec,
      { ...parent2Spec, referenceName: "parent2Ref" },
      { ...parent3Spec, referenceName: "parent3Ref" },
    ]
  };
  assertEquals(getInlineParentSpecs(tableJsonSpec), [parent1Spec]);
});

Deno.test('get empty inline parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      { ...parent2Spec, referenceName: "parent2Ref" },
      { ...parent3Spec, referenceName: "parent3Ref" },
    ]
  };
  assertEquals(getInlineParentSpecs(tableJsonSpec), []);
  assertEquals(getInlineParentSpecs({table: "empty"}), []);
});

Deno.test('get non-empty referenced parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      parent1Spec,
      { ...parent2Spec, referenceName: "parent2Ref" },
      { ...parent3Spec, referenceName: "parent3Ref" },
    ]
  };
  assertEquals(getReferencedParentSpecs(tableJsonSpec), [
    { ...parent2Spec, referenceName: "parent2Ref" },
    { ...parent3Spec, referenceName: "parent3Ref" }
  ]);
});

Deno.test('get empty referenced parent tables', () => {
  const tableJsonSpec: TableJsonSpec = {
    table: "child_table",
    parentTables: [
      parent1Spec,
    ]
  };
  assertEquals(getReferencedParentSpecs(tableJsonSpec), []);
  assertEquals(getReferencedParentSpecs({table: "empty"}), []);
});
