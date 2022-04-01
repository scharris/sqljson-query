import { ResultRepr } from "../query-specs";

export interface QueryReprSqlPath {
  readonly queryName: string;
  readonly resultRepr: ResultRepr;
  readonly sqlPath: string;
}