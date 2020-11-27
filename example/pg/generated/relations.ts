// ---------------------------------------------------------------------------
// [ THIS SOURCE CODE WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
// ---------------------------------------------------------------------------


export const drugs = { // schema 'drugs'
   "authority": { // relation 'authority'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "name": { type: "varchar", nullable: false, pkPart: null, len: 200, prec: null, precRadix: null, scale: null },
      "url": { type: "varchar", nullable: true, pkPart: null, len: 500, prec: null, precRadix: null, scale: null },
      "description": { type: "varchar", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "weight": { type: "int4", nullable: true, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "analyst": { // relation 'analyst'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "short_name": { type: "varchar", nullable: false, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
   },
   
   "compound": { // relation 'compound'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "display_name": { type: "varchar", nullable: true, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
      "nctr_isis_id": { type: "varchar", nullable: true, pkPart: null, len: 100, prec: null, precRadix: null, scale: null },
      "smiles": { type: "varchar", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "canonical_smiles": { type: "varchar", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "cas": { type: "varchar", nullable: true, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
      "mol_formula": { type: "varchar", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "mol_weight": { type: "numeric", nullable: true, pkPart: null, len: null, prec: null, precRadix: 10, scale: null },
      "entered": { type: "timestamptz", nullable: true, pkPart: null, len: null, prec: null, precRadix: null, scale: null },
      "entered_by": { type: "int4", nullable: false, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "advisory_type": { // relation 'advisory_type'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "name": { type: "varchar", nullable: false, pkPart: null, len: 50, prec: null, precRadix: null, scale: null },
      "authority_id": { type: "int4", nullable: false, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "drug": { // relation 'drug'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "name": { type: "varchar", nullable: false, pkPart: null, len: 500, prec: null, precRadix: null, scale: null },
      "compound_id": { type: "int4", nullable: false, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
      "mesh_id": { type: "varchar", nullable: true, pkPart: null, len: 7, prec: null, precRadix: null, scale: null },
      "drugbank_id": { type: "varchar", nullable: true, pkPart: null, len: 7, prec: null, precRadix: null, scale: null },
      "cid": { type: "int4", nullable: true, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
      "therapeutic_indications": { type: "varchar", nullable: true, pkPart: null, len: 4000, prec: null, precRadix: null, scale: null },
      "registered": { type: "timestamptz", nullable: true, pkPart: null, len: null, prec: null, precRadix: null, scale: null },
      "registered_by": { type: "int4", nullable: false, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
      "market_entry_date": { type: "date", nullable: true, pkPart: null, len: null, prec: null, precRadix: null, scale: null },
   },
   
   "drug_reference": { // relation 'drug_reference'
      "drug_id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "reference_id": { type: "int4", nullable: false, pkPart: 2, len: null, prec: 32, precRadix: 2, scale: 0 },
      "priority": { type: "int4", nullable: true, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "reference": { // relation 'reference'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "publication": { type: "varchar", nullable: false, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
   },
   
   "advisory": { // relation 'advisory'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "drug_id": { type: "int4", nullable: false, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
      "advisory_type_id": { type: "int4", nullable: false, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
      "text": { type: "varchar", nullable: false, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
   },
   
   "functional_category": { // relation 'functional_category'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "name": { type: "varchar", nullable: false, pkPart: null, len: 500, prec: null, precRadix: null, scale: null },
      "description": { type: "varchar", nullable: true, pkPart: null, len: 2000, prec: null, precRadix: null, scale: null },
      "parent_functional_category_id": { type: "int4", nullable: true, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "drug_functional_category": { // relation 'drug_functional_category'
      "drug_id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "functional_category_id": { type: "int4", nullable: false, pkPart: 2, len: null, prec: 32, precRadix: 2, scale: 0 },
      "authority_id": { type: "int4", nullable: false, pkPart: 3, len: null, prec: 32, precRadix: 2, scale: 0 },
      "seq": { type: "int4", nullable: true, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "brand": { // relation 'brand'
      "drug_id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "brand_name": { type: "varchar", nullable: false, pkPart: 2, len: 200, prec: null, precRadix: null, scale: null },
      "language_code": { type: "varchar", nullable: true, pkPart: null, len: 10, prec: null, precRadix: null, scale: null },
      "manufacturer_id": { type: "int4", nullable: true, pkPart: null, len: null, prec: 32, precRadix: 2, scale: 0 },
   },
   
   "manufacturer": { // relation 'manufacturer'
      "id": { type: "int4", nullable: false, pkPart: 1, len: null, prec: 32, precRadix: 2, scale: 0 },
      "name": { type: "varchar", nullable: false, pkPart: null, len: 200, prec: null, precRadix: null, scale: null },
   },
   
};
