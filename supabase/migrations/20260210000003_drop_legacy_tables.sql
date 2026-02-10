-- Drop legacy/unused tables
--
-- These were either stubs that never shipped or tables we're intentionally
-- consolidating into `documents` + JSONB extraction blobs.

-- Email-derived stubs (unused)
DROP TABLE IF EXISTS public.email_tasks;
DROP TABLE IF EXISTS public.email_entities;

-- Project tracking stubs (unused)
DROP TABLE IF EXISTS public.project_tasks;
DROP TABLE IF EXISTS public.project_tracking;

-- Insurance tables (unused; extraction is stored in documents.raw_extraction)
DROP TABLE IF EXISTS public.contract_insurance_requirements;
DROP TABLE IF EXISTS public.company_insurance;

-- NOI extractions (store NOI PDFs + extraction JSON on documents)
--
-- If a legacy noi_extractions table exists, migrate rows into documents before dropping.
DO $$
BEGIN
  IF to_regclass('public.noi_extractions') IS NOT NULL THEN
    INSERT INTO public.documents (
      project_id,
      document_type,
      summary,
      raw_extraction,
      file_path,
      file_name,
      extraction_status
    )
    SELECT
      CASE
        WHEN (t.j->>'project_id') ~ '^[0-9]+$' THEN (t.j->>'project_id')::int
        ELSE NULL
      END AS project_id,
      'NOI' AS document_type,
      concat_ws(' ',
        NULLIF(t.j->>'site_name', ''),
        NULLIF(t.j->>'permit_id', ''),
        NULLIF(t.j->>'ltf_number', '')
      ) AS summary,
      t.j AS raw_extraction,
      t.j->>'file_path' AS file_path,
      t.j->>'file_name' AS file_name,
      'success' AS extraction_status
    FROM public.noi_extractions n
    CROSS JOIN LATERAL (SELECT to_jsonb(n) AS j) t;
  END IF;
END $$;
DROP TABLE IF EXISTS public.noi_extractions;

-- DB-backed catalog tables (catalog is hardcoded read-only in the web app)
DROP TABLE IF EXISTS public.catalog_bundle_items;
DROP TABLE IF EXISTS public.catalog_takeoff_bundles;
DROP TABLE IF EXISTS public.catalog_items;
DROP TABLE IF EXISTS public.catalog_subcategories;
DROP TABLE IF EXISTS public.catalog_categories;

