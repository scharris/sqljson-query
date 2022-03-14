import {propertyNameDefaultFunction} from '../util/property-names';

test('property name default function should return names properly for stored-lowercase db with AS_IN_DB option', () => {
  const lcDbPropNameFn = propertyNameDefaultFunction('AS_IN_DB', 'INSENSITIVE_STORED_LOWER');
  expect(lcDbPropNameFn('some_field')).toEqual('some_field');
  expect(lcDbPropNameFn('SOME_FIELD')).toEqual('some_field');
  expect(lcDbPropNameFn('Some_Field')).toEqual('Some_Field');
});

test('property name default function should return names properly for stored-uppercase db with AS_IN_DB option', () => {
  const ucDbPropNameFn = propertyNameDefaultFunction('AS_IN_DB', 'INSENSITIVE_STORED_UPPER');
  expect(ucDbPropNameFn('some_field')).toEqual('SOME_FIELD');
  expect(ucDbPropNameFn('SOME_FIELD')).toEqual('SOME_FIELD');
  expect(ucDbPropNameFn('Some_Field')).toEqual('Some_Field');
});

test('property name default function should return camelcase names for CAMELCASED option', () => {
  const lcDbpropNameFn = propertyNameDefaultFunction('CAMELCASE', 'INSENSITIVE_STORED_LOWER');
  expect(lcDbpropNameFn('some_field')).toEqual('someField');
  expect(lcDbpropNameFn('Some_field')).toEqual('someField');
  const ucDbpropNameFn = propertyNameDefaultFunction('CAMELCASE', 'INSENSITIVE_STORED_UPPER');
  expect(ucDbpropNameFn('some_field')).toEqual('someField');
  expect(ucDbpropNameFn('Some_field')).toEqual('someField');
});

test('property name default function should return camelcase names by default', () => {
  const propNameFn = propertyNameDefaultFunction(undefined, 'INSENSITIVE_STORED_LOWER');
  expect(propNameFn('some_field')).toEqual('someField');
  expect(propNameFn('Some_field')).toEqual('someField');
});
