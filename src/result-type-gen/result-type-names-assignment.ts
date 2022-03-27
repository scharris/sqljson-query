import { partitionByEquality } from "../util/collections";
import { hashString, makeNameNotInSet, upperCamelCase } from "../util/strings";
import { resultTypeSpecsEqual, ResultTypeSpec } from "./result-type-spec-generator";

export function assignResultTypeNames(resTypes: ResultTypeSpec[]): Map<ResultTypeSpec,string>
{
  const rtHash = (rt: ResultTypeSpec) =>
    hashString(rt.table) +
    2 * hashString(rt.resultTypeName ?? '') +
    3 * rt.tableFieldProperties.length +
    17 * rt.parentReferenceProperties.length +
    27 * rt.childCollectionProperties.length;

  const m = new Map<ResultTypeSpec,string>();
  const typeNames = new Set<string>(resTypes.flatMap(rt => rt.resultTypeName ? [rt.resultTypeName] : []));

  for (const eqGrp of partitionByEquality(resTypes, rtHash, resultTypeSpecsEqual) )
  {
    const typeName = eqGrp[0].resultTypeName || makeNameNotInSet(upperCamelCase(eqGrp[0].table), typeNames, '_');

    for (const resType of eqGrp)
      m.set(resType, typeName);

    typeNames.add(typeName);
  }

  return m;
}
