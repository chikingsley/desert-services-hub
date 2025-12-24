-- Desert Services Hub - Core Quoting Tables
-- Phase 1: Quotes, Versions, Sections, Line Items

-- Quotes table (the base document for a job)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_number TEXT NOT NULL UNIQUE, -- e.g., "251217"
  job_name TEXT NOT NULL,
  job_address TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quote versions (iterations of line items/scope)
CREATE TABLE IF NOT EXISTS quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  change_summary TEXT, -- optional, for v2+
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quote_id, version_number)
);

-- Sections for organizing line items
CREATE TABLE IF NOT EXISTS quote_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Line items within a quote version
CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
  section_id UUID REFERENCES quote_sections(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(12, 4) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'EA', -- EA, LF, SF, CY, etc.
  unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0, -- internal cost
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0, -- price to customer
  is_excluded BOOLEAN NOT NULL DEFAULT false, -- strikethrough in PDF
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quote sends (delivery records)
CREATE TABLE IF NOT EXISTS quote_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
  estimate_number TEXT NOT NULL, -- e.g., "25121701" or "25121701-R2"
  recipient_company TEXT,
  recipient_name TEXT,
  recipient_email TEXT,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalog items (reusable pricing templates)
CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL, -- e.g., "inlet", "silt_fence", "grading"
  description TEXT NOT NULL,
  default_unit TEXT NOT NULL DEFAULT 'EA',
  default_unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
  default_unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  category TEXT, -- for grouping in the UI
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_base_number ON quotes(base_number);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_versions_quote_id ON quote_versions(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_sections_version_id ON quote_sections(version_id);
CREATE INDEX IF NOT EXISTS idx_quote_line_items_version_id ON quote_line_items(version_id);
CREATE INDEX IF NOT EXISTS idx_quote_line_items_section_id ON quote_line_items(section_id);
CREATE INDEX IF NOT EXISTS idx_quote_sends_version_id ON quote_sends(version_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_item_type ON catalog_items(item_type);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quote_line_items_updated_at ON quote_line_items;
CREATE TRIGGER update_quote_line_items_updated_at
  BEFORE UPDATE ON quote_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_catalog_items_updated_at ON catalog_items;
CREATE TRIGGER update_catalog_items_updated_at
  BEFORE UPDATE ON catalog_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
