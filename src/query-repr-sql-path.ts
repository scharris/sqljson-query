import {ResultRepr} from './query-specs.ts';

export interface QueryReprSqlPath
{
  readonly queryName: string;
  readonly resultRepr: ResultRepr;
  readonly sqlPath: string;
}

