# TODO

## Priority 1: Pipeline Fix — Consolidate Downloads

The email processing pipeline needs downloading consolidated as the **first step** before triage or extraction.

- [ ] Consolidate body-link download code (currently split across multiple files in `packages/email/src/sync/`)
- [ ] Reorganize into a coherent folder structure that makes sense and is scalable
- [ ] Ensure downloads happen BEFORE triage so triage has full document context
- [ ] Fix extraction gate in `packages/email/src/webhook-notification-handler.ts:236` — body-link attachments skip extraction because gate only checks `graphAttachments.inserted > 0`

## Priority 2: Fix Post-Triage Flow

Figure out what happens after triage — the classification result isn't being used well.

- [ ] Job dispatch is currently DISABLED in `lib/triage/dispatch.ts:215` — decide what actions should fire
- [ ] Review classification categories and whether they're still the right set
- [ ] Determine what linking/actions should trigger based on classification

## Priority 3: Linking Cleanup

### link-accounts.ts — Audit/Simplify

Signals 0a/0b/0c (project/estimate/contact inheritance) are questionable — emails already get accounts through domain when they arrive. Most of these batch inheritance signals shouldn't be needed if account_id is set correctly at ingestion.

- [ ] Audit whether signals 0a/0b/0c are still needed or if ingestion already handles this
- [ ] Signal 4 (name lookup for platform emails without domain) — verify which platform emails actually lack a domain. Questionable.
- [ ] Signal 6 (conversation propagation) — should be unnecessary if account is set at ingestion
- [ ] `is_internal` reference at line 273 — replace with domain check (desertservices.net, desertservices.app, upwindcompanies.com)

### link-contacts.ts — Fixes

- [ ] Synthetic `monday_item_id` hack (`email:{sha1}`) — refactor to make `monday_item_id` nullable, use `email` as unique key for email-sourced contacts
- [ ] Layer 3 enrichment: change `body_preview` to `body_full` in `SIGNATURE_SNIPPETS_SQL` (line 276-283) — body_preview is truncated and may cut off signature blocks

## Priority 4: Clear Stale INTERNAL Classification

28,855 emails still have `classification = 'INTERNAL'` in the database. The TypeScript type already removed it.

- [ ] Create migration to NULL out classification on those rows
- [ ] The `is_internal` boolean column stays — it's used correctly in `link-contacts.ts:199` as a filter
- [ ] Don't reprocess until priorities 1-3 are fixed — no point re-triaging with a broken pipeline

## Priority 5: Backfill Triage

~418K unclassified emails (389K already NULL + 29K after INTERNAL clear).

- [ ] Only run after pipeline (priority 1) and post-triage flow (priority 2) are fixed
- [ ] Existing `email_triage_batch` pg_cron job will handle it automatically once rows are eligible

## Priority 6: Repo Cleanup

- [ ] Remove random junk/temp files from repo root (check_*.ts, test_*.ts, list_tables.ts, total_unlinked.ts, etc.)
- [ ] Clean up 95 unstaged modified files — commit what's real, discard what's noise
