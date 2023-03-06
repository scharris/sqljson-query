import {Nullable} from '../../util/mod';
import {SelectEntry} from "../sql-specs";

export interface SqlDialect
{
  getRowObjectExpression(selectEntries: SelectEntry[], srcAlias: string): string;

  getAggregatedRowObjectsExpression(selectEntries: SelectEntry[], orderBy: Nullable<string>, srcAlias: string): string;

  getAggregatedColumnValuesExpression(selectEntry: SelectEntry, orderBy: Nullable<string>, srcAlias: string): string;

  quoteObjectNameIfNeeded(name: string): string;

  quoteColumnNameIfNeeded(name: string): string;

  indentSpaces: number;
}
