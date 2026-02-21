-- Reactive Link Cascade Triggers
--
-- When any link is created (email→project, estimate→email, estimate→project),
-- related entities get their project_id propagated automatically.
-- When a link is removed, affected entities recompute from remaining paths.
--
-- Forward (link): aggressive, fills NULLs
-- Backward (unlink): defensive, recomputes from remaining paths

-- ============================================================================
-- RECOMPUTE FUNCTIONS
-- Given an entity, derive its project_id from all available paths.
-- Returns NULL if no path exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION recompute_email_project_id(p_email_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_project_id INTEGER;
  v_conversation_id TEXT;
BEGIN
  -- Path 1: conversation sibling already has a project
  SELECT conversation_id INTO v_conversation_id
  FROM emails WHERE id = p_email_id;

  IF v_conversation_id IS NOT NULL THEN
    SELECT e2.project_id INTO v_project_id
    FROM emails e2
    WHERE e2.conversation_id = v_conversation_id
      AND e2.id != p_email_id
      AND e2.project_id IS NOT NULL
    LIMIT 1;

    IF v_project_id IS NOT NULL THEN
      RETURN v_project_id;
    END IF;
  END IF;

  -- Path 2: linked estimate → project (unambiguous single-project only)
  SELECT pe.project_id INTO v_project_id
  FROM estimate_emails ee
  JOIN project_estimates pe ON pe.estimate_id = ee.estimate_id
  JOIN projects p ON p.id = pe.project_id
  WHERE ee.email_id = p_email_id
  ORDER BY
    CASE p.lifecycle_state
      WHEN 'active' THEN 0 WHEN 'seed' THEN 1 WHEN 'lost' THEN 2 ELSE 3
    END
  LIMIT 1;

  RETURN v_project_id; -- NULL if no path
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recompute_document_project_id(p_document_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_project_id INTEGER;
BEGIN
  -- Path 1: email → project
  SELECT e.project_id INTO v_project_id
  FROM documents d
  JOIN emails e ON e.id = d.email_id
  WHERE d.id = p_document_id
    AND e.project_id IS NOT NULL;

  IF v_project_id IS NOT NULL THEN
    RETURN v_project_id;
  END IF;

  -- Path 2: estimate → project (prefer active/seed)
  SELECT pe.project_id INTO v_project_id
  FROM documents d
  JOIN project_estimates pe ON pe.estimate_id = d.estimate_id
  JOIN projects p ON p.id = pe.project_id
  WHERE d.id = p_document_id
  ORDER BY
    CASE p.lifecycle_state
      WHEN 'active' THEN 0 WHEN 'seed' THEN 1 WHEN 'lost' THEN 2 ELSE 3
    END
  LIMIT 1;

  RETURN v_project_id; -- NULL if no path
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER 1: emails.project_id changed
--
-- Forward: propagate to documents + conversation siblings
-- Backward: recompute documents when cleared
-- ============================================================================

CREATE OR REPLACE FUNCTION on_email_project_changed() RETURNS trigger AS $$
BEGIN
  -- Skip if project_id didn't actually change
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    -- FORWARD: email got a project_id → push to documents
    UPDATE documents
    SET project_id = NEW.project_id, updated_at = now()
    WHERE email_id = NEW.id
      AND project_id IS NULL;

    -- FORWARD: push to conversation siblings with no project
    IF NEW.conversation_id IS NOT NULL THEN
      UPDATE emails
      SET project_id = NEW.project_id
      WHERE conversation_id = NEW.conversation_id
        AND id != NEW.id
        AND project_id IS NULL;
    END IF;

  ELSE
    -- BACKWARD: email lost its project_id → recompute its documents
    UPDATE documents
    SET project_id = recompute_document_project_id(documents.id),
        updated_at = now()
    WHERE email_id = NEW.id
      AND project_id = OLD.project_id;
    -- Note: we only clear docs that had the SAME project we just removed,
    -- not docs that got their project_id from another path
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_project_changed ON emails;
CREATE TRIGGER trg_email_project_changed
  AFTER UPDATE OF project_id ON emails
  FOR EACH ROW
  EXECUTE FUNCTION on_email_project_changed();

-- ============================================================================
-- TRIGGER 2: estimate_emails row inserted or deleted
--
-- Forward: new estimate link → derive project → set on email
-- Backward: estimate unlinked → recompute email project_id
-- ============================================================================

CREATE OR REPLACE FUNCTION on_estimate_email_linked() RETURNS trigger AS $$
DECLARE
  v_project_id INTEGER;
  v_project_count INTEGER;
BEGIN
  -- How many distinct projects does this estimate map to?
  SELECT COUNT(DISTINCT project_id), MIN(project_id)
  INTO v_project_count, v_project_id
  FROM project_estimates
  WHERE estimate_id = NEW.estimate_id;

  -- Only propagate if unambiguous (exactly 1 project)
  IF v_project_count = 1 AND v_project_id IS NOT NULL THEN
    UPDATE emails
    SET project_id = v_project_id
    WHERE id = NEW.email_id
      AND project_id IS NULL;
    -- This fires trg_email_project_changed → cascades to docs + conversation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION on_estimate_email_unlinked() RETURNS trigger AS $$
DECLARE
  v_new_project_id INTEGER;
BEGIN
  -- Recompute the email's project_id from remaining paths
  v_new_project_id := recompute_email_project_id(OLD.email_id);

  UPDATE emails
  SET project_id = v_new_project_id
  WHERE id = OLD.email_id
    AND project_id IS DISTINCT FROM v_new_project_id;
  -- If project_id changed, trg_email_project_changed cascades to docs

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estimate_email_linked ON estimate_emails;
CREATE TRIGGER trg_estimate_email_linked
  AFTER INSERT ON estimate_emails
  FOR EACH ROW
  EXECUTE FUNCTION on_estimate_email_linked();

DROP TRIGGER IF EXISTS trg_estimate_email_unlinked ON estimate_emails;
CREATE TRIGGER trg_estimate_email_unlinked
  AFTER DELETE ON estimate_emails
  FOR EACH ROW
  EXECUTE FUNCTION on_estimate_email_unlinked();

-- ============================================================================
-- TRIGGER 3: project_estimates row inserted or deleted
--
-- Forward: estimate linked to project → propagate to all emails for that estimate
-- Backward: estimate unlinked from project → recompute affected emails
-- ============================================================================

CREATE OR REPLACE FUNCTION on_project_estimate_linked() RETURNS trigger AS $$
DECLARE
  v_project_count INTEGER;
BEGIN
  -- Only propagate if this estimate now maps to exactly 1 project
  SELECT COUNT(DISTINCT project_id) INTO v_project_count
  FROM project_estimates
  WHERE estimate_id = NEW.estimate_id;

  IF v_project_count = 1 THEN
    -- Set project_id on all emails linked to this estimate that don't have one
    UPDATE emails e
    SET project_id = NEW.project_id
    FROM estimate_emails ee
    WHERE ee.estimate_id = NEW.estimate_id
      AND ee.email_id = e.id
      AND e.project_id IS NULL;
    -- Each email update fires trg_email_project_changed → cascades

    -- Also set on documents directly linked to this estimate
    UPDATE documents
    SET project_id = NEW.project_id, updated_at = now()
    WHERE estimate_id = NEW.estimate_id
      AND project_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION on_project_estimate_unlinked() RETURNS trigger AS $$
BEGIN
  -- Recompute project_id for emails that had the removed project
  -- through this estimate path
  UPDATE emails e
  SET project_id = recompute_email_project_id(e.id)
  FROM estimate_emails ee
  WHERE ee.estimate_id = OLD.estimate_id
    AND ee.email_id = e.id
    AND e.project_id = OLD.project_id;
  -- Changed emails fire trg_email_project_changed → cascades to docs

  -- Recompute documents directly linked to this estimate
  UPDATE documents
  SET project_id = recompute_document_project_id(documents.id),
      updated_at = now()
  WHERE estimate_id = OLD.estimate_id
    AND project_id = OLD.project_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_estimate_linked ON project_estimates;
CREATE TRIGGER trg_project_estimate_linked
  AFTER INSERT ON project_estimates
  FOR EACH ROW
  EXECUTE FUNCTION on_project_estimate_linked();

DROP TRIGGER IF EXISTS trg_project_estimate_unlinked ON project_estimates;
CREATE TRIGGER trg_project_estimate_unlinked
  AFTER DELETE ON project_estimates
  FOR EACH ROW
  EXECUTE FUNCTION on_project_estimate_unlinked();

-- ============================================================================
-- TRIGGER 4: documents.email_id set (new document linked to email)
--
-- Inherit project_id from the email if available
-- ============================================================================

CREATE OR REPLACE FUNCTION on_document_email_set() RETURNS trigger AS $$
BEGIN
  IF NEW.email_id IS NOT NULL AND NEW.project_id IS NULL THEN
    UPDATE documents
    SET project_id = (SELECT project_id FROM emails WHERE id = NEW.email_id),
        updated_at = now()
    WHERE id = NEW.id
      AND project_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_email_set ON documents;
CREATE TRIGGER trg_document_email_set
  AFTER INSERT ON documents
  FOR EACH ROW
  WHEN (NEW.email_id IS NOT NULL AND NEW.project_id IS NULL)
  EXECUTE FUNCTION on_document_email_set();

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Triggers installed:
--   emails:            trg_email_project_changed     (UPDATE of project_id)
--   estimate_emails:   trg_estimate_email_linked      (INSERT)
--                      trg_estimate_email_unlinked    (DELETE)
--   project_estimates: trg_project_estimate_linked    (INSERT)
--                      trg_project_estimate_unlinked  (DELETE)
--   documents:         trg_document_email_set         (INSERT)
--
-- Cascade behavior:
--   Link email→project:      docs inherit, conversation siblings inherit
--   Unlink email→project:    docs recompute (keep if another path exists)
--   Link estimate→email:     email gets project if estimate maps to exactly 1
--   Unlink estimate→email:   email recomputes project from remaining paths
--   Link estimate→project:   all estimate's emails + docs get project
--   Unlink estimate→project: affected emails + docs recompute
--   New document for email:  inherits email's project_id
