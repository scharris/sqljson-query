import {
  computeIfAbsent, setsEqual, mapSet, makeMap, makeArrayValuesMap, partitionByEquality, dedupe
} from '../util/collections';

test('computeIfAbsent', () => {
  const m = new Map([['key1', 'value1']]);

  computeIfAbsent(m, 'key2', (k: string) => 'computed for ' + k);

  expect(m).toEqual(new Map([['key1', 'value1'], ['key2', 'computed for key2']]));

  computeIfAbsent(m, 'key2', (k: string) => 'recomputed');

  expect(m).toEqual(new Map([['key1', 'value1'], ['key2', 'computed for key2']]));
});

test('setsEqual', () => {
  expect(new Set(['s1', 's2'])).toEqual(new Set(['s2', 's1']));
  expect(new Set(['s1', 's2'])).not.toEqual(new Set(['s2', 's1', 's3']));
});

test('mapSet', () => {
  expect(mapSet(new Set(['s1', 's-two']), s => s.length)).toEqual(new Set([2, 5]));
});

test('makeMap', () => {
  expect(makeMap(['s1', 's2'], e => e + 'k', e => e + 'v')).toEqual(
    new Map([['s1k', 's1v'], ['s2k', 's2v']])
  );
});

test('makeArrayValuesMap', () => {
  expect(makeArrayValuesMap(['s1', 's2', 't1'], e => e.charAt(0), e => e + 'v')).toEqual(
    new Map([['s', ['s1v','s2v']], ['t', ['t1v']]])
  );
});

test('partitionByEquality', () => {
  type T = { n: number, s: string };
  const hashFn = (t: T) => t.n + 3 * t.s.length;
  const eqFn = (t1: T, t2: T) => t1.n === t2.n && t1.s === t2.s;

  const ts = [
    { n: 3, s: 'v3' },
    { n: 1, s: 'v1' },
    { n: 2, s: 'v2' },
    { n: 1, s: 'v1' },
    { n: 4, s: 'v4' },
    { n: 3, s: 'v3' },
  ];

  // Groups should be ordered by the position of their first occurring member.
  expect(partitionByEquality(ts, hashFn, eqFn)).toEqual([
    [{ n: 3, s: 'v3' }, { n: 3, s: 'v3' }],
    [{ n: 1, s: 'v1' }, { n: 1, s: 'v1' }],
    [{ n: 2, s: 'v2' }],
    [{ n: 4, s: 'v4' }],
  ]);
});

test('dedupe empty', () => {
  expect(dedupe([])).toEqual([]);
});

test('dedupe on array without dupes', () => {
  const o1 = { a: 1, b: 2 };
  const o2 = { c: 1 };
  const o3 = { d: 1 };
  expect(dedupe([o1,o2,o3])).toEqual([o1,o2,o3]);
});

test('dedupe on array with dupes', () => {
  const o11 = { a: 1, b: 2 };
  const o12 = o11;
  const o2 = { c: 1 };
  const o3 = { d: 1 };
  expect(dedupe([o11, o2, o12, o3])).toEqual([o11, o2, o3]);
});
