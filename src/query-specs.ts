import {QuerySpec, TableJsonSpec, ReferencedParentSpec, InlineParentSpec}
  from './query-spec-types';
export * from './query-spec-types';

export function getInlineParentSpecs(tableSpec: TableJsonSpec): InlineParentSpec[]
{
  return (tableSpec.parentTables || []).flatMap(ts =>
    ts.referenceName === undefined ? [ts as InlineParentSpec] : []
  );
}

export function getReferencedParentSpecs(tableSpec: TableJsonSpec): ReferencedParentSpec[]
{
  return (tableSpec.parentTables || []).flatMap(ts =>
    ts.referenceName != null ? [ts as ReferencedParentSpec] : []
  );
}

export function getQueryParamNames(querySpec: QuerySpec): string[]
{
  return getParamNames(querySpec.tableJson);
}

function getParamNames(tableJsonSpec: TableJsonSpec): string[]
{
  const paramNames: string[] = [];

  for (const childSpec of tableJsonSpec.childTables || [])
    paramNames.push(...getParamNames(childSpec.tableJson));

  for (const parentSpec of tableJsonSpec.parentTables || [])
    paramNames.push(...getParamNames(parentSpec.tableJson));

  if (tableJsonSpec?.recordCondition?.paramNames != undefined)
    paramNames.push(...tableJsonSpec.recordCondition.paramNames);

  return paramNames;
}

export function addLocPart(specLoc: SpecLocation, addPart: string)
{
  return {
    ...specLoc,
    queryPart: !specLoc.queryPart ? addPart: `${specLoc.queryPart} / ${addPart}`
  };
}

export interface SpecLocation
{
  queryName: string;
  queryPart?: string;
}

export class SpecError extends Error
{
  constructor(public specLocation: SpecLocation, public problem: string)
  {
    super(`SpecError in query '${specLocation.queryName}' at ${specLocation.queryPart || 'top level'}: ${problem}`);
  }
}

