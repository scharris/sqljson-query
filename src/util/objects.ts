export function deepEquals(o1: any, o2: any): boolean
{
  if (typeof o1 !== 'object' || o1 == null)
    return o1 === o2;

  const keys1 = Object.keys(o1);
  const keys2 = Object.keys(o2);

  if (keys1.length !== keys2.length)
    return false;

  for (const key of keys1)
  {
    if ( !deepEquals(o1[key], o2[key]) )
      return false;
  }

  return true;
}
