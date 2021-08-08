import {propertyNameDefaultFunction} from '../util/property-names';

test('property name default function should return names unmodified for AS_IN_DB option', () => {
  expect(propertyNameDefaultFunction('AS_IN_DB')('some_field')).toEqual('some_field');
  expect(propertyNameDefaultFunction('AS_IN_DB')('SOME_FIELD')).toEqual('SOME_FIELD');
});

test('property name default function should return camelcase names for CAMELCASED option', () => {
  expect(propertyNameDefaultFunction('CAMELCASE')('some_field')).toEqual('someField');
  expect(propertyNameDefaultFunction('CAMELCASE')('Some_field')).toEqual('someField');
});

test('property name default function should return camelcase names by default', () => {
  expect(propertyNameDefaultFunction(undefined)('some_field')).toEqual('someField');
  expect(propertyNameDefaultFunction(undefined)('Some_field')).toEqual('someField');
});
