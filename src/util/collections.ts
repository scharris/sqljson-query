
export function computeIfAbsent<K,V>
  (
    m: Map<K,V>,
    k: K,
    valueMaker: (k: K) => V
  )
  : V
{
  const maybeVal: V | undefined = m.get(k);
  if (maybeVal != undefined)
    return maybeVal;

  const newVal = valueMaker(k);
  m.set(k, newVal);
  return newVal;
}

export function setsEqual<T>(s1: Set<T>, s2: Set<T>): boolean
{
  if ( s1.size !== s2.size)
    return false;

  for (const x of s1)
  {
    if ( !s2.has(x) )
      return false;
  }

  return true;
}

export function mapSet<T,U>(ts: Set<T>, f: (t: T) => U): Set<U>
{
  const us = new Set<U>();

  for (const t of ts)
    us.add(f(t));

  return us;
}

export function makeMap<T,K,V>
  (
    ts: Iterable<T>,
    keyFn: (el: T) => K,
    valFn: (el: T) => V
  )
  : Map<K,V>
{
  const m = new Map<K,V>();

  for (const t of ts)
  {
    const key = keyFn(t);
    const val = valFn(t);
    m.set(key, val);
  }

  return m;
}

export function mapValues<K,V,U>
  (
    map: Map<K,V>,
    f: (v: V) => U
  )
  : Map<K,U>
{
  const m = new Map<K,U>();

  for (const [k,v] of map.entries())
    m.set(k, f(v));

  return m;
}

export function makeArrayValuesMap<T,K,V>
  (
    ts: T[],
    keyFn: (el: T) => K,
    valFn: (el: T) => V
  )
  : Map<K,V[]>
{
  const m = new Map<K,V[]>();

  for (const t of ts)
  {
    const key = keyFn(t);
    const vals = computeIfAbsent(m, key, (_k) => []);
    vals.push(valFn(t));
  }

  return m;
}

/// Partition the passed array into equality groups using the passed hash and equality functions.
/// Groups are returned in ascending order of the minimum original indexes of their member items.
export function partitionByEquality<T>
  (
    ts: T[],
    hash: (t: T) => number,
    eq: (t1: T, t2: T) => boolean
  )
  : T[][]
{
  const res: T[][] = [];

  // Keep track of each equality group's minimum item index from the ts array, for final sorting.
  const origItemIxs = getItemIndexMap(ts);
  const eqGroupToMinItemIx = new Map<T[],number>();

  const hashGroups = makeArrayValuesMap(ts, hash, t => t).values();

  for (const hashGroup of hashGroups)
  {
    const equalityGroups: T[][] = [];

    for (const t of hashGroup)
    {
      const itemIx = origItemIxs.get(t) || 0;

      let added = false;
      for (const eqGroup of equalityGroups)
      {
        if ( eq(t, eqGroup[0]) )
        {
          eqGroup.push(t);
          const grpMin = eqGroupToMinItemIx.get(eqGroup) || 0;
          if (itemIx < grpMin)
            eqGroupToMinItemIx.set(eqGroup, itemIx);
          added = true;
          break;
        }
      }

      if (!added)
      {
        const eqGroup = [t];
        equalityGroups.push(eqGroup);
        eqGroupToMinItemIx.set(eqGroup, itemIx);
      }
    }

    res.push(...equalityGroups);
  }

  res.sort((ts1, ts2) => (eqGroupToMinItemIx.get(ts1) || 0) - (eqGroupToMinItemIx.get(ts2) || 0));
  return res;
}

function getItemIndexMap<T>(ts: T[])
{
  const m = new Map<T, number>();
  ts.forEach((t, ix) => m.set(t, ix));
  return m;
}

export function nonEmpty<T>(ts: T[] | null | undefined): ts is NonNullable<T[]>
{
  return (ts != null && ts.length > 0);
}