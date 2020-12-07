-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
-- JSON_OBJECT_ROWS results representation for drugs query
select
  -- row object builder for table 'drug'
  json_object(
    'id' value q."id",
    'genericName' value q."genericName",
    'meshId' value q."meshId",
    'cid' value q."cid",
    'registered' value q."registered",
    'marketEntryDate' value q."marketEntryDate",
    'therapeuticIndications' value q."therapeuticIndications",
    'cidPlus1000' value q."cidPlus1000",
    'registeredByAnalyst' value q."registeredByAnalyst",
    'compound' value q."compound",
    'brands' value q."brands",
    'advisories' value q."advisories",
    'functionalCategories' value q."functionalCategories" returning clob
  ) json
from (
  -- base query for table 'drug'
  select
    d.id "id",
    d.name "genericName",
    d.mesh_id "meshId",
    d.cid "cid",
    d.registered "registered",
    d.market_entry_date "marketEntryDate",
    d.therapeutic_indications "therapeuticIndications",
    d.cid + 1000 "cidPlus1000",
    -- parent table 'analyst' referenced as 'registeredByAnalyst'
    (
      select
        -- row object builder for table 'analyst'
        json_object(
          'id' value q."id",
          'shortName' value q."shortName" returning clob
        ) json
      from (
        -- base query for table 'analyst'
        select
          a.id "id",
          a.short_name "shortName"
        from
          ANALYST a
        where (
          d.REGISTERED_BY = a.ID
        )
      ) q
    ) "registeredByAnalyst",
    -- parent table 'compound' referenced as 'compound'
    (
      select
        -- row object builder for table 'compound'
        json_object(
          'displayName' value q."displayName",
          'nctrIsisId' value q."nctrIsisId",
          'cas' value q."cas",
          'entered' value q."entered",
          'enteredByAnalyst' value q."enteredByAnalyst" returning clob
        ) json
      from (
        -- base query for table 'compound'
        select
          c.display_name "displayName",
          c.nctr_isis_id "nctrIsisId",
          c.cas "cas",
          c.entered "entered",
          -- parent table 'analyst' referenced as 'enteredByAnalyst'
          (
            select
              -- row object builder for table 'analyst'
              json_object(
                'id' value q."id",
                'shortName' value q."shortName" returning clob
              ) json
            from (
              -- base query for table 'analyst'
              select
                a.id "id",
                a.short_name "shortName"
              from
                ANALYST a
              where (
                c.ENTERED_BY = a.ID
              )
            ) q
          ) "enteredByAnalyst"
        from
          COMPOUND c
        where (
          d.COMPOUND_ID = c.ID
        )
      ) q
    ) "compound",
    -- records from child table 'brand' as collection 'brands'
    (
      select
        -- aggregated row objects builder for table 'brand'
        treat(coalesce(json_arrayagg(json_object(
          'brandName' value q."brandName",
          'manufacturer' value q."manufacturer" returning clob
        ) returning clob), to_clob('[]')) as json) json
      from (
        -- base query for table 'brand'
        select
          b.brand_name "brandName",
          -- field(s) inlined from parent table 'manufacturer'
          q."manufacturer" "manufacturer"
        from
          BRAND b
          -- parent table 'manufacturer', joined for inlined fields
          left join (
            select
              m.ID "_ID",
              m.name "manufacturer"
            from
              MANUFACTURER m
            
          ) q on b.MANUFACTURER_ID = q."_ID"
        where (
          b.DRUG_ID = d.ID
        )
      ) q
    ) "brands",
    -- records from child table 'advisory' as collection 'advisories'
    (
      select
        -- aggregated row objects builder for table 'advisory'
        treat(coalesce(json_arrayagg(json_object(
          'advisoryText' value q."advisoryText",
          'advisoryType' value q."advisoryType",
          'exprYieldingTwo' value q."exprYieldingTwo",
          'authorityName' value q."authorityName",
          'authorityUrl' value q."authorityUrl",
          'authorityDescription' value q."authorityDescription" returning clob
        ) returning clob), to_clob('[]')) as json) json
      from (
        -- base query for table 'advisory'
        select
          a.text "advisoryText",
          -- field(s) inlined from parent table 'advisory_type'
          q."advisoryType" "advisoryType",
          q."exprYieldingTwo" "exprYieldingTwo",
          q."authorityName" "authorityName",
          q."authorityUrl" "authorityUrl",
          q."authorityDescription" "authorityDescription"
        from
          ADVISORY a
          -- parent table 'advisory_type', joined for inlined fields
          left join (
            select
              at.ID "_ID",
              at.name "advisoryType",
              (1 + 1) "exprYieldingTwo",
              -- field(s) inlined from parent table 'authority'
              q."authorityName" "authorityName",
              q."authorityUrl" "authorityUrl",
              q."authorityDescription" "authorityDescription"
            from
              ADVISORY_TYPE at
              -- parent table 'authority', joined for inlined fields
              left join (
                select
                  a.ID "_ID",
                  a.name "authorityName",
                  a.url "authorityUrl",
                  a.description "authorityDescription"
                from
                  AUTHORITY a
                
              ) q on at.AUTHORITY_ID = q."_ID"
            
          ) q on a.ADVISORY_TYPE_ID = q."_ID"
        where (
          a.DRUG_ID = d.ID
        )
      ) q
    ) "advisories",
    -- records from child table 'drug_functional_category' as collection 'functionalCategories'
    (
      select
        -- aggregated row objects builder for table 'drug_functional_category'
        treat(coalesce(json_arrayagg(json_object(
          'categoryName' value q."categoryName",
          'description' value q."description",
          'authorityName' value q."authorityName",
          'authorityUrl' value q."authorityUrl",
          'authorityDescription' value q."authorityDescription" returning clob
        ) returning clob), to_clob('[]')) as json) json
      from (
        -- base query for table 'drug_functional_category'
        select
          -- field(s) inlined from parent table 'functional_category'
          q."categoryName" "categoryName",
          q."description" "description",
          -- field(s) inlined from parent table 'authority'
          q1."authorityName" "authorityName",
          q1."authorityUrl" "authorityUrl",
          q1."authorityDescription" "authorityDescription"
        from
          DRUG_FUNCTIONAL_CATEGORY dfc
          -- parent table 'functional_category', joined for inlined fields
          left join (
            select
              fc.ID "_ID",
              fc.name "categoryName",
              fc.description "description"
            from
              FUNCTIONAL_CATEGORY fc
            
          ) q on dfc.FUNCTIONAL_CATEGORY_ID = q."_ID"
          -- parent table 'authority', joined for inlined fields
          left join (
            select
              a.ID "_ID",
              a.name "authorityName",
              a.url "authorityUrl",
              a.description "authorityDescription"
            from
              AUTHORITY a
            
          ) q1 on dfc.AUTHORITY_ID = q1."_ID"
        where (
          dfc.DRUG_ID = d.ID
        )
      ) q
    ) "functionalCategories"
  from
    DRUG d
  where (
    (d.name like :namePattern)
  )
) q
order by q."genericName"
