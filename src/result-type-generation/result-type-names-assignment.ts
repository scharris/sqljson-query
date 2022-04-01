import { partitionByEquality } from "../util/collections";
import { relIdDescn } from "../util/database-names";
import { hashString, makeNameNotInSet, upperCamelCase } from "../util/strings";
import { ResultTypeSpec, resultTypeSpecsEqual } from "./result-type-specs";

export function assignResultTypeNames(resTypes: ResultTypeSpec[]): Map<ResultTypeSpec,string>
{
  const rtHash = (rt: ResultTypeSpec) =>
    hashString(relIdDescn(rt.table)) +
    2 * hashString(rt.resultTypeName ?? '') +
    3 * rt.properties.reduce((acc, prop) => acc * hashString(prop.propertyName), 1);

  const m = new Map<ResultTypeSpec,string>();
  const typeNames = new Set<string>(resTypes.flatMap(rt => rt.resultTypeName ? [rt.resultTypeName] : []));

  for (const eqGrp of partitionByEquality(resTypes, rtHash, resultTypeSpecsEqual) )
  {
    const typeName =
      eqGrp[0].resultTypeName ||
      makeNameNotInSet(upperCamelCase(eqGrp[0].table.name), typeNames, '_');

    for (const resType of eqGrp)
      m.set(resType, typeName);

    typeNames.add(typeName);
  }

  return m;
}