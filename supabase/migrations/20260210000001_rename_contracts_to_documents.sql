-- Rename contracts → documents
-- The "contracts" table is a general document store (PDFs, images, text of all types).
-- Rename to better reflect its purpose. Add permit_id FK for linking docs to dust permits.

ALTER TABLE contracts RENAME TO documents;
ALTER INDEX contracts_pkey RENAME TO documents_pkey;
ALTER INDEX idx_contracts_doc_type RENAME TO idx_documents_doc_type;
ALTER SEQUENCE contracts_id_seq RENAME TO documents_id_seq;

-- Link documents to specific dust permits (NOIs, SWPPPs, permit PDFs, site plans, etc.)
ALTER TABLE documents ADD COLUMN permit_id TEXT REFERENCES dust_permits_filed_by_desert_services(id);
CREATE INDEX idx_documents_permit ON documents(permit_id) WHERE permit_id IS NOT NULL;

-- Drop contract-specific columns. Structured extraction data now lives in raw_extraction JSONB.
ALTER TABLE documents DROP COLUMN IF EXISTS contractor;
ALTER TABLE documents DROP COLUMN IF EXISTS subcontractor;
ALTER TABLE documents DROP COLUMN IF EXISTS project_name;
ALTER TABLE documents DROP COLUMN IF EXISTS project_address;
ALTER TABLE documents DROP COLUMN IF EXISTS project_number;
ALTER TABLE documents DROP COLUMN IF EXISTS contract_value;
ALTER TABLE documents DROP COLUMN IF EXISTS retainage_pct;
ALTER TABLE documents DROP COLUMN IF EXISTS scope;
ALTER TABLE documents DROP COLUMN IF EXISTS effective_date;
ALTER TABLE documents DROP COLUMN IF EXISTS start_date;
ALTER TABLE documents DROP COLUMN IF EXISTS completion_date;
ALTER TABLE documents DROP COLUMN IF EXISTS payment_terms;
ALTER TABLE documents DROP COLUMN IF EXISTS estimate_reference;
ALTER TABLE documents DROP COLUMN IF EXISTS line_items;
ALTER TABLE documents DROP COLUMN IF EXISTS requirements;
