-- Migration: 001-event-system
-- Description: Add event-driven orchestration tables to census.db
-- Date: 2026-01-28
--
-- This migration adds:
--   - stakeholders: contacts per project who receive notifications
--   - permits: dust permits linked to projects
--   - events: log of things that happened (immutable audit trail)
--   - actions: things to do in response to events
--   - workflows: templates for event → action mappings
--
-- See: EVENT_SYSTEM.md for full documentation

-- =============================================================================
-- STAKEHOLDERS
-- Contacts associated with a project who receive deliverables or notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS stakeholders (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    account_id INTEGER REFERENCES accounts(id),

    -- Contact info
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,

    -- Role classification
    -- External: pm, super, billing_external, owner_rep
    -- Internal: internal_billing, internal_ops, internal_permits
    role TEXT,

    -- Flags
    is_primary INTEGER DEFAULT 0,      -- Primary contact for this role
    is_internal INTEGER DEFAULT 0,     -- 1 if Desert Services employee

    -- Notification preferences (JSON array of event types)
    -- e.g., ["permit_submitted", "permit_issued", "plan_delivered"]
    notify_on TEXT,

    -- Source tracking
    source TEXT,                       -- How we found them: email, contract, manual
    source_id TEXT,                    -- ID in source (email_id, etc.)

    notes TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stakeholders_project ON stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_account ON stakeholders(account_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_email ON stakeholders(email);
CREATE INDEX IF NOT EXISTS idx_stakeholders_role ON stakeholders(role);
CREATE INDEX IF NOT EXISTS idx_stakeholders_internal ON stakeholders(is_internal);

-- =============================================================================
-- PERMITS
-- Dust permits linked to projects. Synced from auto-permit or created directly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS permits (
    id INTEGER PRIMARY KEY,

    -- Identifiers
    application_number TEXT UNIQUE,    -- D number (e.g., D0064501)
    permit_number TEXT,                -- F number when issued

    -- Relationships
    project_id INTEGER REFERENCES projects(id),
    account_id INTEGER REFERENCES accounts(id),

    -- Classification
    permit_type TEXT DEFAULT 'dust',   -- dust, noi
    status TEXT,                       -- draft, submitted, pending_payment, processing, active, expired, closed, superseded

    -- Details
    project_name TEXT,                 -- Denormalized for convenience
    company_name TEXT,                 -- Denormalized for convenience
    acreage REAL,
    fee REAL,
    site_address TEXT,
    parcel_number TEXT,

    -- Dates
    submitted_at TEXT,
    paid_at TEXT,
    issued_at TEXT,
    expires_at TEXT,
    closed_at TEXT,

    -- Notification tracking
    customer_notified_at TEXT,         -- When customer email sent
    internal_notified_at TEXT,         -- When internal billing notified

    -- Sync tracking
    auto_permit_synced_at TEXT,        -- Last sync from auto-permit DB

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_account ON permits(account_id);
CREATE INDEX IF NOT EXISTS idx_permits_app_number ON permits(application_number);
CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_expires ON permits(expires_at);

-- =============================================================================
-- EVENTS
-- Log of things that happened. Immutable audit trail.
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,

    -- Context
    project_id INTEGER REFERENCES projects(id),
    permit_id INTEGER REFERENCES permits(id),

    -- Event info
    event_type TEXT NOT NULL,          -- permit_submitted, contract_signed, etc.
    event_data TEXT,                   -- JSON payload with event details

    -- Source tracking
    source TEXT,                       -- auto-permit, email, manual, api
    source_id TEXT,                    -- ID in source system
    actor TEXT,                        -- Who/what triggered: user email, system, agent

    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_permit ON events(permit_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- =============================================================================
-- ACTIONS
-- Things to do in response to events. Workers/agents execute these.
-- =============================================================================

CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY,

    -- Relationships
    event_id INTEGER REFERENCES events(id),
    project_id INTEGER REFERENCES projects(id),
    permit_id INTEGER REFERENCES permits(id),

    -- Action definition
    action_type TEXT NOT NULL,         -- send_customer_email, send_internal_billing, etc.
    action_config TEXT,                -- JSON config (template, recipients override, etc.)

    -- Execution state
    status TEXT DEFAULT 'pending',     -- pending, running, complete, failed, skipped
    priority INTEGER DEFAULT 100,      -- Lower = higher priority

    -- Execution tracking
    attempt_count INTEGER DEFAULT 0,
    last_error TEXT,
    started_at TEXT,
    completed_at TEXT,
    result TEXT,                       -- JSON result (email ID, API response, etc.)

    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_actions_event ON actions(event_id);
CREATE INDEX IF NOT EXISTS idx_actions_project ON actions(project_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type);
CREATE INDEX IF NOT EXISTS idx_actions_pending ON actions(status, priority) WHERE status = 'pending';

-- =============================================================================
-- WORKFLOWS
-- Templates defining what actions fire on what events.
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY,

    name TEXT,                         -- Human-readable name
    description TEXT,

    -- Trigger
    event_type TEXT NOT NULL,          -- Event that triggers this workflow

    -- Action to spawn
    action_type TEXT NOT NULL,
    action_config TEXT,                -- Default JSON config for action

    -- Control
    is_active INTEGER DEFAULT 1,       -- 1 if enabled
    priority INTEGER DEFAULT 100,      -- Action priority when spawned
    conditions TEXT,                   -- JSON conditions for when to apply (optional)

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflows_event ON workflows(event_type);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);

-- =============================================================================
-- DEFAULT WORKFLOWS
-- Seed data for standard event → action mappings
-- =============================================================================

-- Permit Submitted Workflows
INSERT OR IGNORE INTO workflows (name, event_type, action_type, action_config, priority) VALUES
    ('Permit Submitted - Customer Email',
     'permit_submitted',
     'send_customer_email',
     '{"template": "dust-permit-submitted"}',
     10),
    ('Permit Submitted - Internal Billing',
     'permit_submitted',
     'send_internal_billing',
     '{"template": "dust-permit-billing", "recipients": ["kendra@desertservices.net", "jayson@desertservices.net", "eva@desertservices.net"]}',
     20);

-- Permit Issued Workflows
INSERT OR IGNORE INTO workflows (name, event_type, action_type, action_config, priority) VALUES
    ('Permit Issued - Customer Email',
     'permit_issued',
     'send_customer_email',
     '{"template": "dust-permit-issued"}',
     10);

-- Permit Renewed Workflows
INSERT OR IGNORE INTO workflows (name, event_type, action_type, action_config, priority) VALUES
    ('Permit Renewed - Customer Email',
     'permit_renewed',
     'send_customer_email',
     '{"template": "dust-permit-renewed"}',
     10),
    ('Permit Renewed - Internal Billing',
     'permit_renewed',
     'send_internal_billing',
     '{"template": "dust-permit-billing-renewed", "recipients": ["kendra@desertservices.net", "jayson@desertservices.net", "eva@desertservices.net"]}',
     20);

-- Permit Revised Workflows
INSERT OR IGNORE INTO workflows (name, event_type, action_type, action_config, priority) VALUES
    ('Permit Revised - Customer Email',
     'permit_revised',
     'send_customer_email',
     '{"template": "dust-permit-revised"}',
     10),
    ('Permit Revised - Internal Billing',
     'permit_revised',
     'send_internal_billing',
     '{"template": "dust-permit-billing-revised", "recipients": ["kendra@desertservices.net", "jayson@desertservices.net", "eva@desertservices.net"]}',
     20);

-- =============================================================================
-- MIGRATION TRACKING
-- =============================================================================

-- Record this migration
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO _migrations (name) VALUES ('001-event-system');
