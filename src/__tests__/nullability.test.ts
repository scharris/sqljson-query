import {valueOr} from '../util/nullability';

test('valueOr should return first value when not null', () => {
  expect(valueOr('first', 'second')).toEqual('first');
});

test('valueOr should return second value when first is null or undefined', () => {
  expect(valueOr(null, 'second')).toEqual('second');
  expect(valueOr(undefined, 'second')).toEqual('second');
});
