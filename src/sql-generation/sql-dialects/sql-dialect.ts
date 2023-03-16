import {Nullable} from '../../util/mod';
import {SelectEntry} from "../sql-specs";

export interface SqlDialect
{
  getRowObjectExpression
    (
      selectEntries: SelectEntry[],
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string
    )
    : string;

  getAggregatedRowObjectsExpression
    (
      selectEntries: SelectEntry[],
      selectEntryValueSqlFn: (selectEntry: SelectEntry) => string,
      orderBy: Nullable<string>
    )
    : string;

  getAggregatedColumnValuesExpression
    (
      valueExpression: string,
      orderBy: Nullable<string>
    )
    : string;

  quoteObjectNameIfNeeded(name: string): string;

  quoteColumnNameIfNeeded(name: string): string;

  indentSpaces: number;
}
