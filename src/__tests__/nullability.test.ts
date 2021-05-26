import {assertEquals} from "https://deno.land/std@0.97.0/testing/asserts.ts";
import {valueOr} from '../util/nullability.ts';

Deno.test('valueOr should return first value when not null', () => {
  assertEquals(valueOr('first', 'second'), 'first');
});

Deno.test('valueOr should return second value when first is null or undefined', () => {
  assertEquals(valueOr(null, 'second'), 'second');
  assertEquals(valueOr(undefined, 'second'), 'second');
});
