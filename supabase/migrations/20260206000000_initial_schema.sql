-- Initial Postgres schema for Desert Services Hub
-- Migrated from SQLite (Supabase Postgres) → Supabase Postgres

-- ============================================
-- Mailboxes
-- ============================================
CREATE TABLE IF NOT EXISTS mailboxes (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  last_sync_at TIMESTAMPTZ,
  email_count INTEGER DEFAULT 0,
  delta_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Accounts (Contractors/GCs)
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  domain TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'contractor',
  contact_count INTEGER DEFAULT 0,
  email_count INTEGER DEFAULT 0,
  monday_account_id TEXT,
  monday_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Takeoffs (PDF measurement data)
-- ============================================
CREATE TABLE IF NOT EXISTS takeoffs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pdf_url TEXT,
  annotations TEXT NOT NULL DEFAULT '[]',
  page_scales TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Estimates (Monday.com ESTIMATING board)
-- ============================================
CREATE TABLE IF NOT EXISTS estimates (
  id SERIAL PRIMARY KEY,
  monday_item_id TEXT UNIQUE,
  name TEXT NOT NULL,
  estimate_number TEXT,
  contractor TEXT,
  group_id TEXT,
  group_title TEXT,
  monday_url TEXT,
  account_monday_id TEXT,
  account_domain TEXT,
  bid_status TEXT,
  bid_value REAL,
  awarded_value REAL,
  bid_source TEXT,
  awarded INTEGER DEFAULT 0,
  due_date TEXT,
  location TEXT,
  sharepoint_url TEXT,
  estimate_storage_bucket TEXT,
  estimate_storage_path TEXT,
  estimate_file_name TEXT,
  estimate_synced_at TIMESTAMPTZ,
  plans_storage_path TEXT,
  contracts_storage_path TEXT,
  noi_storage_path TEXT,
  extraction_status TEXT,
  extraction_error TEXT,
  extracted_at TIMESTAMPTZ,
  extracted_grand_total REAL,
  extracted_job_name TEXT,
  extracted_estimator TEXT,
  service_type TEXT,
  takeoff_id TEXT REFERENCES takeoffs(id),
  base_number TEXT,
  job_address TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  estimator TEXT,
  estimator_email TEXT,
  notes TEXT,
  is_locked INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Projects
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  name TEXT NOT NULL,
  normalized_name TEXT,
  address TEXT,
  email_count INTEGER DEFAULT 0,
  first_seen TEXT,
  last_seen TEXT,
  monday_item_id TEXT,
  project_number TEXT,
  contractor TEXT,
  awarded_value REAL,
  location_city TEXT,
  location_state TEXT,
  location_zip TEXT,
  contract_status TEXT DEFAULT 'Pending',
  dust_permit_status TEXT DEFAULT 'Not Needed',
  noi_status TEXT DEFAULT 'Not Needed',
  swppp_status TEXT DEFAULT 'Not Needed',
  signs_status TEXT DEFAULT 'Not Needed',
  outlook_folder TEXT,
  notes TEXT,
  linked_estimate_ids TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Emails
-- ============================================
CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  mailbox_id INTEGER NOT NULL REFERENCES mailboxes(id),
  conversation_id TEXT,
  subject TEXT,
  from_email TEXT,
  from_name TEXT,
  to_emails TEXT,
  cc_emails TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  has_attachments INTEGER DEFAULT 0,
  attachment_names TEXT,
  body_preview TEXT,
  web_url TEXT,
  classification TEXT,
  classification_confidence REAL,
  classification_method TEXT,
  project_name TEXT,
  contractor_name TEXT,
  monday_estimate_id TEXT,
  notion_project_id TEXT,
  account_id INTEGER REFERENCES accounts(id),
  project_id INTEGER REFERENCES projects(id),
  body_full TEXT,
  body_html TEXT,
  from_domain TEXT,
  is_internal INTEGER DEFAULT 0,
  is_forwarded INTEGER DEFAULT 0,
  original_sender_email TEXT,
  original_sender_domain TEXT,
  categories TEXT,
  normalized_subject TEXT,
  estimate_id INTEGER REFERENCES estimates(id),
  thread_id TEXT,
  internet_message_id TEXT,
  is_platform_email INTEGER DEFAULT 0,
  platform_name TEXT,
  real_sender_name TEXT,
  real_sender_company TEXT,
  real_sender_email TEXT,
  real_sender_domain TEXT,
  is_excluded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Project Aliases
-- ============================================
CREATE TABLE IF NOT EXISTS project_aliases (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, normalized_alias)
);

-- ============================================
-- Company Aliases
-- ============================================
CREATE TABLE IF NOT EXISTS company_aliases (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, alias)
);

-- ============================================
-- Attachments
-- ============================================
CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  attachment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  storage_bucket TEXT,
  storage_path TEXT,
  extracted_text TEXT,
  extraction_status TEXT DEFAULT 'pending',
  extraction_error TEXT,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email_id, attachment_id)
);

-- ============================================
-- Estimate Versions
-- ============================================
CREATE TABLE IF NOT EXISTS estimate_versions (
  id TEXT PRIMARY KEY,
  estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual',
  total REAL NOT NULL DEFAULT 0,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Estimate Sections
-- ============================================
CREATE TABLE IF NOT EXISTS estimate_sections (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  show_subtotal INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Estimate Line Items
-- ============================================
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES estimate_sections(id),
  item_name TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'EA',
  unit_cost REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Catalog
-- ============================================
CREATE TABLE IF NOT EXISTS catalog_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  selection_mode TEXT NOT NULL DEFAULT 'pick-many',
  supports_takeoff INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  selection_mode TEXT NOT NULL DEFAULT 'pick-many',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
  subcategory_id TEXT REFERENCES catalog_subcategories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'Each',
  notes TEXT,
  default_qty REAL NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_takeoff_item INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_takeoff_bundles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  tool_type TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_bundle_items (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES catalog_takeoff_bundles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  is_required INTEGER DEFAULT 1,
  quantity_multiplier REAL DEFAULT 1.0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bundle_id, item_id)
);

-- ============================================
-- SWPPP Work Orders
-- ============================================
CREATE TABLE IF NOT EXISTS swppp_work_orders (
  id SERIAL PRIMARY KEY,
  row_number INTEGER NOT NULL,
  worksheet TEXT NOT NULL,
  date TEXT,
  contractor TEXT,
  job_name TEXT,
  address TEXT,
  contact TEXT,
  phone TEXT,
  work_description TEXT,
  date_entered TEXT,
  comments TEXT,
  invoice TEXT,
  work_completed TEXT,
  account_id INTEGER REFERENCES accounts(id),
  project_id INTEGER REFERENCES projects(id),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worksheet, row_number)
);

-- ============================================
-- Dust Permits
-- ============================================
CREATE TABLE IF NOT EXISTS dust_permits_filed_by_desert_services (
  id TEXT PRIMARY KEY,
  project_name TEXT,
  account_id INTEGER REFERENCES accounts(id),
  project_id INTEGER REFERENCES projects(id),
  company_name TEXT,
  portal_company_id TEXT,
  status TEXT,
  submitted_date TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  closed_date TEXT,
  previous_app_id TEXT,
  project_start_date TEXT,
  project_end_date TEXT,
  address TEXT,
  city TEXT,
  parcel TEXT,
  is_block_permit INTEGER DEFAULT 0,
  is_accelerated INTEGER DEFAULT 0,
  invoice_number TEXT,
  invoice_charges REAL,
  invoice_balance REAL,
  created_at BIGINT DEFAULT (extract(epoch FROM now()))::bigint,
  updated_at BIGINT DEFAULT (extract(epoch FROM now()))::bigint
);

-- ============================================
-- Stakeholders
-- ============================================
CREATE TABLE IF NOT EXISTS stakeholders (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_type, email)
);

-- ============================================
-- Notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  subject TEXT NOT NULL,
  draft_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Monday Assets
-- ============================================
CREATE TABLE IF NOT EXISTS monday_assets (
  id SERIAL PRIMARY KEY,
  monday_asset_id TEXT NOT NULL UNIQUE,
  monday_item_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_extension TEXT,
  file_size INTEGER,
  local_path TEXT,
  downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Webhook Jobs
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_jobs (
  id SERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  monday_item_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ============================================
-- Outlook Subscriptions
-- ============================================
CREATE TABLE IF NOT EXISTS outlook_subscriptions (
  id SERIAL PRIMARY KEY,
  subscription_id TEXT UNIQUE NOT NULL,
  mailbox_email TEXT NOT NULL,
  mailbox_id INTEGER NOT NULL REFERENCES mailboxes(id),
  resource TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'created,updated',
  expiration TIMESTAMPTZ NOT NULL,
  client_state TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  renewed_at TIMESTAMPTZ
);

-- ============================================
-- Contacts (from Monday CONTACTS board)
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  monday_item_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  priority TEXT,
  account_id INTEGER REFERENCES accounts(id),
  contractor_monday_id TEXT,
  project_monday_ids TEXT,
  territory_owner TEXT,
  imported_account_name TEXT,
  imported_phone TEXT,
  contractor_matched TEXT,
  phone_matched TEXT,
  group_id TEXT,
  group_title TEXT,
  mobile_phone TEXT,
  office_phone TEXT,
  company_phone TEXT,
  company_fax TEXT,
  contractor_searched_at TEXT,
  contractor_search_notes TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Contact Emails (linking contacts to emails)
-- ============================================
CREATE TABLE IF NOT EXISTS contact_emails (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  email_id INTEGER NOT NULL REFERENCES emails(id),
  relationship TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, email_id, relationship)
);

-- ============================================
-- Email Entities
-- ============================================
CREATE TABLE IF NOT EXISTS email_entities (
  id SERIAL PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Email Tasks
-- ============================================
CREATE TABLE IF NOT EXISTS email_tasks (
  id SERIAL PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES emails(id),
  task_description TEXT NOT NULL,
  task_type TEXT,
  priority TEXT,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Project Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS project_tracking (
  id SERIAL PRIMARY KEY,
  estimate_id INTEGER UNIQUE NOT NULL,
  has_contract INTEGER DEFAULT 0,
  contract_signed INTEGER DEFAULT 0,
  contract_file_path TEXT,
  needs_dust_permit INTEGER DEFAULT 0,
  dust_permit_filed INTEGER DEFAULT 0,
  dust_permit_number TEXT,
  dust_permit_expiry TEXT,
  needs_noi INTEGER DEFAULT 0,
  noi_filed INTEGER DEFAULT 0,
  noi_file_path TEXT,
  needs_swppp INTEGER DEFAULT 0,
  swppp_plan_received INTEGER DEFAULT 0,
  swppp_file_path TEXT,
  needs_grading_drainage INTEGER DEFAULT 0,
  grading_drainage_received INTEGER DEFAULT 0,
  certified_payroll_required INTEGER DEFAULT 0,
  insurance_verified INTEGER DEFAULT 0,
  insurance_exception TEXT,
  swppp_sign_ordered INTEGER DEFAULT 0,
  dust_sign_ordered INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Project Tasks
-- ============================================
CREATE TABLE IF NOT EXISTS project_tasks (
  id SERIAL PRIMARY KEY,
  tracking_id INTEGER NOT NULL REFERENCES project_tracking(id),
  description TEXT NOT NULL,
  task_type TEXT,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  assigned_to TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- Estimate Emails (pre-computed links)
-- ============================================
CREATE TABLE IF NOT EXISTS estimate_emails (
  id SERIAL PRIMARY KEY,
  estimate_id INTEGER NOT NULL REFERENCES estimates(id),
  email_id INTEGER NOT NULL REFERENCES emails(id),
  match_type TEXT NOT NULL,
  match_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(estimate_id, email_id)
);

-- ============================================
-- Insurance
-- ============================================
CREATE TABLE IF NOT EXISTS company_insurance (
  id TEXT PRIMARY KEY DEFAULT 'desert-services',
  gl_each_occurrence INTEGER NOT NULL,
  gl_general_aggregate INTEGER NOT NULL,
  gl_products_completed_ops INTEGER NOT NULL,
  auto_combined_single_limit INTEGER NOT NULL,
  umbrella_each_occurrence INTEGER NOT NULL,
  umbrella_aggregate INTEGER NOT NULL,
  workers_comp_each_accident INTEGER NOT NULL,
  workers_comp_disease_employee INTEGER NOT NULL,
  workers_comp_disease_policy INTEGER NOT NULL,
  professional_liability INTEGER NOT NULL,
  policy_expiration TEXT NOT NULL,
  broker_name TEXT,
  broker_email TEXT,
  broker_phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_insurance_requirements (
  id TEXT PRIMARY KEY,
  contract_id TEXT,
  project_name TEXT NOT NULL,
  contractor_name TEXT NOT NULL,
  gl_each_occurrence INTEGER,
  gl_general_aggregate INTEGER,
  gl_products_completed_ops INTEGER,
  auto_combined_single_limit INTEGER,
  umbrella_each_occurrence INTEGER,
  umbrella_aggregate INTEGER,
  workers_comp_each_accident INTEGER,
  professional_liability INTEGER,
  additional_insureds TEXT,
  waiver_of_subrogation INTEGER DEFAULT 0,
  primary_noncontributory INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================

-- Emails
CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_emails_classification ON emails(classification);
CREATE INDEX IF NOT EXISTS idx_emails_conversation ON emails(conversation_id);
CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_project ON emails(project_id);
CREATE INDEX IF NOT EXISTS idx_emails_estimate ON emails(estimate_id);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_internet_msg_id ON emails(internet_message_id);
CREATE INDEX IF NOT EXISTS idx_emails_platform ON emails(is_platform_email);
CREATE INDEX IF NOT EXISTS idx_emails_platform_name ON emails(platform_name);
CREATE INDEX IF NOT EXISTS idx_emails_excluded ON emails(is_excluded);
CREATE INDEX IF NOT EXISTS idx_emails_normalized_subject ON emails(normalized_subject);

-- Accounts
CREATE INDEX IF NOT EXISTS idx_accounts_domain ON accounts(domain);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_monday ON accounts(monday_account_id);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
CREATE INDEX IF NOT EXISTS idx_project_aliases_normalized ON project_aliases(normalized_alias);

-- Company Aliases
CREATE INDEX IF NOT EXISTS idx_company_aliases_account ON company_aliases(account_id);
CREATE INDEX IF NOT EXISTS idx_company_aliases_alias ON company_aliases(alias);

-- Attachments
CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments(extraction_status);

-- Estimates
CREATE INDEX IF NOT EXISTS idx_estimates_monday_id ON estimates(monday_item_id);
CREATE INDEX IF NOT EXISTS idx_estimates_number ON estimates(estimate_number);
CREATE INDEX IF NOT EXISTS idx_estimates_contractor ON estimates(contractor);
CREATE INDEX IF NOT EXISTS idx_estimates_synced ON estimates(synced_at);
CREATE INDEX IF NOT EXISTS idx_estimates_account ON estimates(account_monday_id);
CREATE INDEX IF NOT EXISTS idx_estimates_domain ON estimates(account_domain);
CREATE INDEX IF NOT EXISTS idx_estimates_extraction ON estimates(extraction_status);
CREATE INDEX IF NOT EXISTS idx_estimates_service_type ON estimates(service_type);
CREATE INDEX IF NOT EXISTS idx_estimates_takeoff ON estimates(takeoff_id);

-- Estimate versions / sections / line items
CREATE INDEX IF NOT EXISTS idx_ev_estimate ON estimate_versions(estimate_id);
CREATE INDEX IF NOT EXISTS idx_ev_current ON estimate_versions(is_current);
CREATE INDEX IF NOT EXISTS idx_es_version ON estimate_sections(version_id);
CREATE INDEX IF NOT EXISTS idx_eli_version ON estimate_line_items(version_id);
CREATE INDEX IF NOT EXISTS idx_eli_section ON estimate_line_items(section_id);

-- SWPPP Work Orders
CREATE INDEX IF NOT EXISTS idx_swppp_wo_worksheet ON swppp_work_orders(worksheet);
CREATE INDEX IF NOT EXISTS idx_swppp_wo_job_name ON swppp_work_orders(job_name);
CREATE INDEX IF NOT EXISTS idx_swppp_wo_contractor ON swppp_work_orders(contractor);
CREATE INDEX IF NOT EXISTS idx_swppp_wo_account ON swppp_work_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_swppp_wo_project ON swppp_work_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_swppp_wo_invoice ON swppp_work_orders(invoice);

-- Stakeholders
CREATE INDEX IF NOT EXISTS idx_stakeholders_event ON stakeholders(event_type);
CREATE INDEX IF NOT EXISTS idx_stakeholders_email ON stakeholders(email);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_ref ON notifications(ref_type, ref_id);

-- Permits
CREATE INDEX IF NOT EXISTS idx_permits_status ON dust_permits_filed_by_desert_services(status);
CREATE INDEX IF NOT EXISTS idx_permits_account ON dust_permits_filed_by_desert_services(account_id);
CREATE INDEX IF NOT EXISTS idx_permits_project ON dust_permits_filed_by_desert_services(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_expiration ON dust_permits_filed_by_desert_services(expiration_date);
CREATE INDEX IF NOT EXISTS idx_permits_portal_company ON dust_permits_filed_by_desert_services(portal_company_id);
CREATE INDEX IF NOT EXISTS idx_permits_parcel ON dust_permits_filed_by_desert_services(parcel);

-- Monday assets
CREATE INDEX IF NOT EXISTS idx_monday_assets_item ON monday_assets(monday_item_id);
CREATE INDEX IF NOT EXISTS idx_monday_assets_column ON monday_assets(column_id);

-- Webhook jobs
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status ON webhook_jobs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_type ON webhook_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_item ON webhook_jobs(monday_item_id);

-- Outlook subscriptions
CREATE INDEX IF NOT EXISTS idx_outlook_subs_mailbox ON outlook_subscriptions(mailbox_email);
CREATE INDEX IF NOT EXISTS idx_outlook_subs_expiration ON outlook_subscriptions(expiration);

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_monday ON contacts(monday_item_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_contractor_monday ON contacts(contractor_monday_id);

-- Contact emails
CREATE INDEX IF NOT EXISTS idx_contact_emails_contact ON contact_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_emails_email ON contact_emails(email_id);

-- Email entities
CREATE INDEX IF NOT EXISTS idx_email_entities_email ON email_entities(email_id);

-- Email tasks
CREATE INDEX IF NOT EXISTS idx_email_tasks_email ON email_tasks(email_id);

-- Project tracking / tasks
CREATE INDEX IF NOT EXISTS idx_project_tracking_estimate ON project_tracking(estimate_id);
CREATE INDEX IF NOT EXISTS idx_project_tracking_status ON project_tracking(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_tracking ON project_tasks(tracking_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);

-- Estimate emails
CREATE INDEX IF NOT EXISTS idx_estimate_emails_estimate ON estimate_emails(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_emails_email ON estimate_emails(email_id);

-- ============================================
-- Full-text search (replaces SQLite FTS5)
-- ============================================
ALTER TABLE emails ADD COLUMN IF NOT EXISTS search_document tsvector;

CREATE INDEX IF NOT EXISTS idx_emails_search ON emails USING GIN(search_document);

-- Trigger to auto-update search_document on insert/update
CREATE OR REPLACE FUNCTION emails_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_document := to_tsvector('english',
    coalesce(NEW.subject, '') || ' ' ||
    coalesce(NEW.from_name, '') || ' ' ||
    coalesce(NEW.from_email, '') || ' ' ||
    coalesce(NEW.body_preview, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER emails_search_trigger
  BEFORE INSERT OR UPDATE OF subject, from_name, from_email, body_preview
  ON emails
  FOR EACH ROW
  EXECUTE FUNCTION emails_search_update();
