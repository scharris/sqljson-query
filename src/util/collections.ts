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

export function arrayEquals<T>
  (
    a1: T[],
    a2: T[],
    itemEq: ((i1: T, i2: T) => boolean)
  )
{
  if ( a1.length !== a2.length )
    return false;

  for ( let i=0; i<a1.length; ++i)
  {
    if ( !itemEq(a1[i], a2[i]) )
      return false
  }

  return true;
}

export function ownPropsEq
  (
    t1: { [key: string]: any },
    t2: { [key: string]: any }
  )
  : boolean
{
  const ownProps1 = Object.getOwnPropertyNames(t1);

  if ( !setsEqual(new Set(ownProps1), new Set(Object.getOwnPropertyNames(t2))) )
    return false;

  for ( const prop of ownProps1 )
  {
    if ( t1[prop] !== t2[prop] )
      return false;
  }

  return true;
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
    m.set(key, vals);
  }

  return m;
}
