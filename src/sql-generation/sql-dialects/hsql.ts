import {Nullable} from '../../util/nullable';
import {indentLines} from '../../util/strings';
import {SqlDialect} from './sql-dialect';
import {SelectEntry} from "../sql-specs";

const simpleIdentifierRegex = new RegExp(/^[A-Za-z][A-Za-z0-9_]+$/);

const sqlKeywordsLowercase = new Set([
  'select', 'from', 'where', 'user', 'order', 'group', 'by', 'over', 'is'
]);

export class HSQLDialect implements SqlDialect
{
  readonly uppercaseNameRegex = /^[A-Z_]+$/;
  readonly quotedStringRegex = /^".*"$/;

  constructor(readonly indentSpaces: number) {}

  getRowObjectExpression
    (
      selectEntries: SelectEntry[],
      srcAlias: string
    )
    : string
  {
    const objectFieldDecls =
      selectEntries
      .map(se=>
        `'${se.projectedName}' value ${srcAlias}.${this.quoteColumnNameIfNeeded(se.projectedName)}` +
        (needsFormatJsonQualifier(se) ? " format json" : "")
      )
      .join(',\n');

    return (
      'json_object(\n' +
        indentLines(objectFieldDecls, this.indentSpaces) + '\n' +
      ')'
    );
  }

  getAggregatedRowObjectsExpression
    (
      selectEntries: SelectEntry[],
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    return (
      'coalesce(json_arrayagg(' +
        this.getRowObjectExpression(selectEntries, srcAlias) +
        (orderBy != null ? ' order by ' + orderBy.replace(/\$\$/g, srcAlias) : '') +
        `), '[]')`
    );
  }

  getAggregatedColumnValuesExpression
    (
      selectEntry: SelectEntry,
      orderBy: Nullable<string>,
      srcAlias: string
    )
    : string
  {
    const columnName = selectEntry.projectedName;

    return (
      `coalesce(json_arrayagg(${srcAlias}.${this.quoteColumnNameIfNeeded(columnName)}` +
        (orderBy != null ? ` order by ${orderBy.replace(/\$\$/g, srcAlias)}` : '') +
        `), '[]')`
    );
  }

  quoteObjectNameIfNeeded(name: string): string
  {
    if ( this.quotedStringRegex.test(name) )
      return name;
    if ( !simpleIdentifierRegex.test(name) ||
         !this.uppercaseNameRegex.test(name) ||
         sqlKeywordsLowercase.has(name.toLowerCase()) )
      return `"${name}"`;
    return name;
  }

  quoteColumnNameIfNeeded(nameExact: string): string
  {
    if ( this.quotedStringRegex.test(nameExact) )
      return nameExact;
    if ( !simpleIdentifierRegex.test(nameExact) || !this.uppercaseNameRegex.test(nameExact) )
      return `"${nameExact}"`;
    return nameExact;
  }
}

function needsFormatJsonQualifier(selectEntry: SelectEntry): boolean
{
  switch (selectEntry.entryType)
  {
    case "se-parent-ref":
    case "se-child-coll":
      return true;
    case "se-field":
    case "se-expr":
    case "se-hidden-pkf":
      return false;
    case "se-inline-parent-prop":
      return needsFormatJsonQualifier(selectEntry.parentSelectEntry);
  }
}

