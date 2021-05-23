import {
  computeIfAbsent, setsEqual, mapSet, makeMap, makeArrayValuesMap, partitionByEquality
} from '../util/collections';

test('computeIfAbsent', () => {
  const m = new Map([['key1', 'value1']]);

  computeIfAbsent(m, 'key2', (k: string) => 'computed for ' + k);

  expect(m).toEqual(new Map([['key1', 'value1'], ['key2', 'computed for key2']]));

  computeIfAbsent(m, 'key2', (k: string) => 'recomputed');

  expect(m).toEqual(new Map([['key1', 'value1'], ['key2', 'computed for key2']]));
});

test('setsEqual', () => {
  expect(setsEqual(new Set(['s1', 's2']), new Set(['s2', 's1']))).toEqual(true);
  expect(setsEqual(new Set(['s1', 's2']), new Set(['s2', 's1', 's3']))).toEqual(false);
});

test('mapSet', () => {
  expect(mapSet(new Set(['s1', 's-two']), s => s.length)).toEqual(new Set([2, 5]));
});

test('makeMap', () => {
  expect(
    makeMap(['s1', 's2'], e => e + 'k', e => e + 'v')).toEqual(
    new Map([['s1k', 's1v'], ['s2k', 's2v']])
  );
});

test('makeArrayValuesMap', () => {
  expect(
    makeArrayValuesMap(['s1', 's2', 't1'], e => e.charAt(0), e => e + 'v')).toEqual(
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
  expect(
    expect(partitionByEquality(ts, hashFn, eqFn)).toEqual([
      [{ n: 3, s: 'v3' }, { n: 3, s: 'v3' }],
      [{ n: 1, s: 'v1' }, { n: 1, s: 'v1' }],
      [{ n: 2, s: 'v2' }],
      [{ n: 4, s: 'v4' }],
    ])
  );
});
