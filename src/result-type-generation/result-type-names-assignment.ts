import { RelId } from "../dbmd";
import { dedupe, partitionByEquality } from "../util/collections";
import { relIdDescn } from "../util/database-names";
import { hashString, makeNameNotInSet, upperCamelCase } from "../util/strings";
import { NamedResultTypeSpec, ResultTypeProperty, ResultTypeSpec, resultTypeSpecsEqual } from "./result-type-specs";

export function dedupedWithAssignedNames
  (
    resTypes: ResultTypeSpec[]
  )
  : NamedResultTypeSpec[]
{
  const rtHash = (rt: ResultTypeSpec) =>
    hashString(relIdDescn(rt.table)) +
    2 * hashString(rt.resultTypeName ?? '') +
    3 * rt.properties.reduce((acc, prop) => acc * hashString(prop.propertyName), 1);

  const equalityGroups = partitionByEquality(resTypes, rtHash, resultTypeSpecsEqual);

  const typeNames = new Set<string>(resTypes.flatMap(rt => rt.resultTypeName ? [rt.resultTypeName] : []));

  // The repr map will hold a representative result type for each equality group, with assigned type name.
  const reprMap = new Map<ResultTypeSpec,MutableResultTypeSpec>();

  for (const equalityGroup of equalityGroups)
  {
    const typeName =
      equalityGroup[0].resultTypeName ||
      makeNameNotInSet(upperCamelCase(equalityGroup[0].table.name), typeNames, '_');

    const reprInstance = { ...equalityGroup[0], resultTypeName: typeName };

    for (const resultType of equalityGroup)
      reprMap.set(resultType, reprInstance);

    typeNames.add(typeName);
  }

  // Now that representative instances of result types have been chosen, replace their properties
  // with equivalent ones that only reference the representative result type instances.
  for (const repr of reprMap.values())
    repr.properties = repr.properties.map(withRepresentativeResultTypes(reprMap));

  return dedupe(resTypes.map(resType => reprMap.get(resType)!));
}

// For a given mapping to representative result type instances (for de-duplication), return a function
// which takes a property and returns an equivalent property that only references representative
// instances of result types.
function withRepresentativeResultTypes
  (
    reprResultTypes: Map<ResultTypeSpec,ResultTypeSpec>
  )
  : (resTypeProp: ResultTypeProperty) => ResultTypeProperty
{
  return resTypeProp => {
    switch (resTypeProp.type)
    {
      case 'rtp-parent-ref':
        return { ...resTypeProp, refResultType: reprResultTypes.get(resTypeProp.refResultType)! };
      case 'rtp-child-coll':
        return { ...resTypeProp, elResultType: reprResultTypes.get(resTypeProp.elResultType)! };
      default:
        return resTypeProp;
    }
  };
}

interface MutableResultTypeSpec
{
  readonly table: RelId;
  properties: ResultTypeProperty[];
  readonly unwrapped: boolean;
  readonly resultTypeName: string;
}