
export * from './collections';
export * from './database-names';
export * from './objects';
export * from './property-names';
export * from './strings';
export * from './nullable';

export function missingCase(caseVal: never): never
{
  let _: never;
  console.log(_ = caseVal);
  return _;
}