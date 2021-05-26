import {assertEquals} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {propertyNameDefaultFunction} from '../util/property-names.ts';

Deno.test('property name default function should return names unmodified for AS_IN_DB option', () => {
  assertEquals(propertyNameDefaultFunction('AS_IN_DB')('some_field'), 'some_field');
  assertEquals(propertyNameDefaultFunction('AS_IN_DB')('SOME_FIELD'), 'SOME_FIELD');
});

Deno.test('property name default function should return camelcase names for CAMELCASED option', () => {
  assertEquals(propertyNameDefaultFunction('CAMELCASE')('some_field'), 'someField');
  assertEquals(propertyNameDefaultFunction('CAMELCASE')('Some_field'), 'someField');
});

Deno.test('property name default function should return camelcase names by default', () => {
  assertEquals(propertyNameDefaultFunction(undefined)('some_field'), 'someField');
  assertEquals(propertyNameDefaultFunction(undefined)('Some_field'), 'someField');
});
