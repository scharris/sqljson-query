export * from './args.ts';
export * from './collections.ts';
export * from './database-names.ts';
export * from './files.ts';
export * from './nullability.ts';
export * from './objects.ts';
export * from './process.ts';
export * from './property-names.ts';
export * from './strings.ts';

export function missingCase(caseVal: never): never
{
  let _: never;
  console.log(_ = caseVal);
  return _;
}

