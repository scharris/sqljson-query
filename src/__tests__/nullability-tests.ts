import {valueOr} from '../util/nullability';

test('valueOr should return first value when not null', () => {
  expect(valueOr('first', 'second')).toBe('first');
});

test('valueOr should return second value when first is null or undefined', () => {
  expect(valueOr(null, 'second')).toBe('second');
  expect(valueOr(undefined, 'second')).toBe('second');
});
