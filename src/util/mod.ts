export * from './args';
export * from './collections';
export * from './database-names';
export * from './files';
export * from './objects';
export * from './process';
export * from './property-names';
export * from './strings';

export function missingCase(caseVal: never): never
{
  let _: never;
  console.log(_ = caseVal);
  return _;
}

