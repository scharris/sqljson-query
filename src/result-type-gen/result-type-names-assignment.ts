import { partitionByEquality } from "../util/collections";
import { hashString, makeNameNotInSet, upperCamelCase } from "../util/strings";
import { resultTypeDecriptorsEqual, ResultTypeDescriptor } from "./result-type-descriptor-generator";

export function assignResultTypeNames(resTypes: ResultTypeDescriptor[]): Map<ResultTypeDescriptor,string>
{
  const rtHash = (rt: ResultTypeDescriptor) =>
    hashString(rt.table) +
    2 * hashString(rt.resultTypeName ?? '') +
    3 * rt.tableFieldProperties.length +
    17 * rt.parentReferenceProperties.length +
    27 * rt.childCollectionProperties.length;

  const m = new Map<ResultTypeDescriptor,string>();
  const typeNames = new Set<string>(resTypes.flatMap(rt => rt.resultTypeName ? [rt.resultTypeName] : []));

  for (const eqGrp of partitionByEquality(resTypes, rtHash, resultTypeDecriptorsEqual) )
  {
    const typeName = eqGrp[0].resultTypeName || makeNameNotInSet(upperCamelCase(eqGrp[0].table), typeNames, '_');

    for (const resType of eqGrp)
      m.set(resType, typeName);

    typeNames.add(typeName);
  }

  return m;
}
