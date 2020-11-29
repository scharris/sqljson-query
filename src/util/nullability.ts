export function valueOr<T>(t: T | null | undefined, defaultVal: T): T
{
  return t != null ? t : defaultVal;
}
