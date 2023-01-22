import { Nullable } from '../../util/mod';

export interface SqlDialect
{
  getRowObjectExpression(colNames: string[], srcAlias: string): string;

  getAggregatedRowObjectsExpression(colNames: string[], orderBy: Nullable<string>, srcAlias: string): string;

  getAggregatedColumnValuesExpression(colName: string, orderBy: Nullable<string>, srcAlias: string): string;

  quoteObjectNameIfNeeded(name: string): string;

  quoteColumnNameIfNeeded(name: string): string;

  indentSpaces: number;
}
