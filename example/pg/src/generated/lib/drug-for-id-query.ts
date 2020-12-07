// ---------------------------------------------------------------------------
// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
// ---------------------------------------------------------------------------

// This section is from the "types-header" file where you can optionally define and/or import
// custom types. Custom types for result properties can be specified either directly in the
// query specs via "fieldTypeInGeneratedSource" in field expressions, or by specifying the
// customPropertyTypeFn in the SourceGenerationOptions structure passed to generateQueries().
type TimestampTZ = string;
type PersonShortName = string;
//


export const sqlResource = "drug-for-id-query.sql";


// Below are types representing the result data for the generated query referenced above.
// The top-level result type is listed first.

export interface Drug
{
   id: number;
   name: string;
   description: string | null;
   category: string | null;
   meshId: string | null;
   cid: number | null;
   registered: TimestampTZ | null;
   marketEntryDate: string | null;
   therapeuticIndications: string | null;
   cidPlus1000: number | null;
   registeredByAnalyst: Analyst;
   compound: Compound;
   brands: Brand[];
   advisories: Advisory[];
   functionalCategories: DrugFunctionalCategory[];
}

export interface Analyst
{
   id: number;
   shortName: PersonShortName;
}

export interface Compound
{
   displayName: string | null;
   nctrIsisId: string | null;
   cas: string | null;
   entered: TimestampTZ | null;
   enteredByAnalyst: Analyst;
}

export interface Brand
{
   brandName: string;
   manufacturer: string | null;
}

export interface Advisory
{
   advisoryText: string;
   advisoryType: string;
   authorityName: string;
   authorityUrl: string | null;
   authorityDescription: string | null;
   exprYieldingTwo: number;
}

export interface DrugFunctionalCategory
{
   categoryName: string;
   description: string | null;
   authorityName: string;
   authorityUrl: string | null;
   authorityDescription: string | null;
}
