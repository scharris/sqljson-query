import * as _ from 'lodash';

export function computeIfAbsent<K,V>
  (
    m: Map<K,V>,
    k: K,
    valueMaker: (k: K) => V
  )
  : V
{
  const maybeVal: V | undefined = m.get(k);
  if ( maybeVal != undefined )
    return maybeVal;

  const newVal = valueMaker(k);
  m.set(k, newVal);
  return newVal;
}

export function setsEqual<T>(s1: Set<T>, s2: Set<T>): boolean
{
  if ( s1.size !== s2.size)
    return false;

  for ( const x of s1 )
  {
    if ( !s2.has(x) )
      return false;
  }

  return true;
}

export function mapSet<T,U>(ts: Set<T>, f: (t: T) => U): Set<U>
{
  const us = new Set<U>();

  for ( const t of ts )
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

  for ( const t of ts )
  {
    const key = keyFn(t);
    const val = valFn(t);
    m.set(key, val);
  }

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

  for ( const t of ts )
  {
    const key = keyFn(t);
    const vals = computeIfAbsent(m, key, (_k) => []);
    vals.push(valFn(t));
  }

  return m;
}

export function partitionByEquality<T>
  (
    ts: T[],
    hashFn: (t: T) => number, 
    eqFn: (t1: T, t2: T) => boolean
  )
  : T[][]
{
  const res: T[][] = [];

  for (const rtHashGroup of Object.values(_.groupBy(ts, hashFn)))
  {
    const equalityGroups: T[][] = [];

    for (const rt of rtHashGroup)
    {
      let added = false;
      for (const eqGrp of equalityGroups)
      {
        if ( eqFn(rt, eqGrp[0]) )
        {
          eqGrp.push(rt);
          added = true;
          break;
        }
      }
      if ( !added )
        equalityGroups.push([rt]);
    }

    res.push(...equalityGroups);
  }

  return res;
}
