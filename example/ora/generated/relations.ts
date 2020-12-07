// ---------------------------------------------------------------------------
// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
// ---------------------------------------------------------------------------


export const DRUGS = { // schema 'DRUGS'
   "ADVISORY": { // relation 'ADVISORY'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "TEXT": { type: "VARCHAR2", nullable: false, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "ADVISORY_TYPE_ID": { type: "NUMBER", nullable: false, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "DRUG_ID": { type: "NUMBER", nullable: false, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
   },
   
   "ADVISORY_TYPE": { // relation 'ADVISORY_TYPE'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "AUTHORITY_ID": { type: "NUMBER", nullable: false, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "NAME": { type: "VARCHAR2", nullable: false, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
   },
   
   "ANALYST": { // relation 'ANALYST'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "SHORT_NAME": { type: "VARCHAR2", nullable: false, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
   },
   
   "AUTHORITY": { // relation 'AUTHORITY'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "WEIGHT": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "DESCRIPTION": { type: "VARCHAR2", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "URL": { type: "VARCHAR2", nullable: true, pkPart: null, len: 500, prec: null, precRadix: null, scale: null },
      "NAME": { type: "VARCHAR2", nullable: false, pkPart: null, len: 200, prec: null, precRadix: null, scale: null },
   },
   
   "BRAND": { // relation 'BRAND'
      "DRUG_ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "MANUFACTURER_ID": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "LANGUAGE_CODE": { type: "VARCHAR2", nullable: true, pkPart: null, len: 10, prec: null, precRadix: null, scale: null },
      "BRAND_NAME": { type: "VARCHAR2", nullable: false, pkPart: 2, len: 200, prec: null, precRadix: null, scale: null },
   },
   
   "COMPOUND": { // relation 'COMPOUND'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "ENTERED_BY": { type: "NUMBER", nullable: false, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "ENTERED": { type: "TIMESTAMP(6) WITH TIME ZONE", nullable: true, pkPart: null, len: 13, prec: null, precRadix: null, scale: 6 },
      "MOL_WEIGHT": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "MOL_FORMULA": { type: "VARCHAR2", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "CAS": { type: "VARCHAR2", nullable: true, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
      "CANONICAL_SMILES": { type: "VARCHAR2", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "SMILES": { type: "VARCHAR2", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "NCTR_ISIS_ID": { type: "VARCHAR2", nullable: true, pkPart: null, len: 100, prec: null, precRadix: null, scale: null },
      "DISPLAY_NAME": { type: "VARCHAR2", nullable: true, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
   },
   
   "DRUG": { // relation 'DRUG'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "MARKET_ENTRY_DATE": { type: "DATE", nullable: true, pkPart: null, len: 7, prec: null, precRadix: null, scale: null },
      "REGISTERED_BY": { type: "NUMBER", nullable: false, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "REGISTERED": { type: "TIMESTAMP(6) WITH TIME ZONE", nullable: true, pkPart: null, len: 13, prec: null, precRadix: null, scale: 6 },
      "THERAPEUTIC_INDICATIONS": { type: "VARCHAR2", nullable: true, pkPart: null, len: 4000, prec: null, precRadix: null, scale: null },
      "CID": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "DRUGBANK_ID": { type: "VARCHAR2", nullable: true, pkPart: null, len: 7, prec: null, precRadix: null, scale: null },
      "MESH_ID": { type: "VARCHAR2", nullable: true, pkPart: null, len: 7, prec: null, precRadix: null, scale: null },
      "COMPOUND_ID": { type: "NUMBER", nullable: false, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "NAME": { type: "VARCHAR2", nullable: false, pkPart: null, len: 500, prec: null, precRadix: null, scale: null },
   },
   
   "DRUG_FUNCTIONAL_CATEGORY": { // relation 'DRUG_FUNCTIONAL_CATEGORY'
      "DRUG_ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "SEQ": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "AUTHORITY_ID": { type: "NUMBER", nullable: false, pkPart: 3, len: 22, prec: null, precRadix: null, scale: 0 },
      "FUNCTIONAL_CATEGORY_ID": { type: "NUMBER", nullable: false, pkPart: 2, len: 22, prec: null, precRadix: null, scale: 0 },
   },
   
   "DRUG_REFERENCE": { // relation 'DRUG_REFERENCE'
      "DRUG_ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "PRIORITY": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "REFERENCE_ID": { type: "NUMBER", nullable: false, pkPart: 2, len: 22, prec: null, precRadix: null, scale: 0 },
   },
   
   "FUNCTIONAL_CATEGORY": { // relation 'FUNCTIONAL_CATEGORY'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "PARENT_FUNCTIONAL_CATEGORY_ID": { type: "NUMBER", nullable: true, pkPart: null, len: 22, prec: null, precRadix: null, scale: 0 },
      "DESCRIPTION": { type: "VARCHAR2", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "NAME": { type: "VARCHAR2", nullable: false, pkPart: null, len: 500, prec: null, precRadix: null, scale: null },
   },
   
   "MANUFACTURER": { // relation 'MANUFACTURER'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "NAME": { type: "VARCHAR2", nullable: false, pkPart: null, len: 200, prec: null, precRadix: null, scale: null },
   },
   
   "REFERENCE": { // relation 'REFERENCE'
      "ID": { type: "NUMBER", nullable: false, pkPart: 1, len: 22, prec: null, precRadix: null, scale: 0 },
      "PUBLICATION": { type: "VARCHAR2", nullable: false, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
   },
   
};
