import { ResultTypeSpec } from "./result-type-specs";

export interface GeneratedResultTypes {
  resultTypeSpecs: ResultTypeSpec[];
  resultTypesSourceCode: string;
  compilationUnitName: string;
}