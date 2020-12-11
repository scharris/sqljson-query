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
    m.set(key, vals);
  }

  return m;
}
