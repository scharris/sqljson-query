// ---------------------------------------------------------------------------
// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
// ---------------------------------------------------------------------------

export const sqlResource = "drug-for-id-query.sql";


// Below are types representing the result data for the generated query referenced above.
// The top-level result type is listed first.

export interface Drug
{
   id: number;
   genericName: string;
   meshId: string | null;
   cid: number | null;
   registered: string | null;
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
   shortName: string;
}

export interface Compound
{
   displayName: string | null;
   nctrIsisId: string | null;
   cas: string | null;
   entered: string | null;
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
