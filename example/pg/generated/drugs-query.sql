-- [ THIS QUERY WAS AUTO-GENERATED, ANY CHANGES MADE HERE MAY BE LOST. ]
-- JSON_OBJECT_ROWS results representation for drugs query
select
  -- row object builder for table 'drug'
  jsonb_build_object(
    'id', q.id,
    'genericName', q."genericName",
    'meshId', q."meshId",
    'cid', q.cid,
    'registered', q.registered,
    'marketEntryDate', q."marketEntryDate",
    'therapeuticIndications', q."therapeuticIndications",
    'cidPlus1000', q."cidPlus1000",
    'registeredByAnalyst', q."registeredByAnalyst",
    'compound', q.compound,
    'brands', q.brands,
    'advisories', q.advisories,
    'functionalCategories', q."functionalCategories"
  ) json
from (
  -- base query for table 'drug'
  select
    d.id as id,
    d.name "genericName",
    d.mesh_id "meshId",
    d.cid as cid,
    d.registered as registered,
    d.market_entry_date "marketEntryDate",
    d.therapeutic_indications "therapeuticIndications",
    d.cid + 1000 "cidPlus1000",
    -- parent table 'analyst' referenced as 'registeredByAnalyst'
    (
      select
        -- row object builder for table 'analyst'
        jsonb_build_object(
          'id', q.id,
          'shortName', q."shortName"
        ) json
      from (
        -- base query for table 'analyst'
        select
          a.id as id,
          a.short_name "shortName"
        from
          analyst a
        where (
          d.registered_by = a.id
        )
      ) q
    ) "registeredByAnalyst",
    -- parent table 'compound' referenced as 'compound'
    (
      select
        -- row object builder for table 'compound'
        jsonb_build_object(
          'displayName', q."displayName",
          'nctrIsisId', q."nctrIsisId",
          'cas', q.cas,
          'entered', q.entered,
          'enteredByAnalyst', q."enteredByAnalyst"
        ) json
      from (
        -- base query for table 'compound'
        select
          c.display_name "displayName",
          c.nctr_isis_id "nctrIsisId",
          c.cas as cas,
          c.entered as entered,
          -- parent table 'analyst' referenced as 'enteredByAnalyst'
          (
            select
              -- row object builder for table 'analyst'
              jsonb_build_object(
                'id', q.id,
                'shortName', q."shortName"
              ) json
            from (
              -- base query for table 'analyst'
              select
                a.id as id,
                a.short_name "shortName"
              from
                analyst a
              where (
                c.entered_by = a.id
              )
            ) q
          ) "enteredByAnalyst"
        from
          compound c
        where (
          d.compound_id = c.id
        )
      ) q
    ) as compound,
    -- records from child table 'brand' as collection 'brands'
    (
      select
        -- aggregated row objects builder for table 'brand'
        coalesce(jsonb_agg(jsonb_build_object(
          'brandName', q."brandName",
          'manufacturer', q.manufacturer
        )),'[]'::jsonb) json
      from (
        -- base query for table 'brand'
        select
          b.brand_name "brandName",
          -- field(s) inlined from parent table 'manufacturer'
          q.manufacturer as manufacturer
        from
          brand b
          -- parent table 'manufacturer', joined for inlined fields
          left join (
            select
              m.id "_id",
              m.name as manufacturer
            from
              manufacturer m
            
          ) q on b.manufacturer_id = q."_id"
        where (
          b.drug_id = d.id
        )
      ) q
    ) as brands,
    -- records from child table 'advisory' as collection 'advisories'
    (
      select
        -- aggregated row objects builder for table 'advisory'
        coalesce(jsonb_agg(jsonb_build_object(
          'advisoryText', q."advisoryText",
          'advisoryType', q."advisoryType",
          'exprYieldingTwo', q."exprYieldingTwo",
          'authorityName', q."authorityName",
          'authorityUrl', q."authorityUrl",
          'authorityDescription', q."authorityDescription"
        )),'[]'::jsonb) json
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
          advisory a
          -- parent table 'advisory_type', joined for inlined fields
          left join (
            select
              at.id "_id",
              at.name "advisoryType",
              (1 + 1) "exprYieldingTwo",
              -- field(s) inlined from parent table 'authority'
              q."authorityName" "authorityName",
              q."authorityUrl" "authorityUrl",
              q."authorityDescription" "authorityDescription"
            from
              advisory_type at
              -- parent table 'authority', joined for inlined fields
              left join (
                select
                  a.id "_id",
                  a.name "authorityName",
                  a.url "authorityUrl",
                  a.description "authorityDescription"
                from
                  authority a
                
              ) q on at.authority_id = q."_id"
            
          ) q on a.advisory_type_id = q."_id"
        where (
          a.drug_id = d.id
        )
      ) q
    ) as advisories,
    -- records from child table 'drug_functional_category' as collection 'functionalCategories'
    (
      select
        -- aggregated row objects builder for table 'drug_functional_category'
        coalesce(jsonb_agg(jsonb_build_object(
          'categoryName', q."categoryName",
          'description', q.description,
          'authorityName', q."authorityName",
          'authorityUrl', q."authorityUrl",
          'authorityDescription', q."authorityDescription"
        )),'[]'::jsonb) json
      from (
        -- base query for table 'drug_functional_category'
        select
          -- field(s) inlined from parent table 'functional_category'
          q."categoryName" "categoryName",
          q.description as description,
          -- field(s) inlined from parent table 'authority'
          q1."authorityName" "authorityName",
          q1."authorityUrl" "authorityUrl",
          q1."authorityDescription" "authorityDescription"
        from
          drug_functional_category dfc
          -- parent table 'functional_category', joined for inlined fields
          left join (
            select
              fc.id "_id",
              fc.name "categoryName",
              fc.description as description
            from
              functional_category fc
            
          ) q on dfc.functional_category_id = q."_id"
          -- parent table 'authority', joined for inlined fields
          left join (
            select
              a.id "_id",
              a.name "authorityName",
              a.url "authorityUrl",
              a.description "authorityDescription"
            from
              authority a
            
          ) q1 on dfc.authority_id = q1."_id"
        where (
          dfc.drug_id = d.id
        )
      ) q
    ) "functionalCategories"
  from
    drug d
  where (
    (d.name ilike $1)
  )
) q
order by q."genericName"
