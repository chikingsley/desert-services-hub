# Trigger.dev Migration Plan

Migration from pgmq/pg_cron/worker.ts to Trigger.dev for observability, retries, and dashboard visibility.

Dashboard: <https://trigger.desertservices.app>

## Completed

| Old Job | Trigger.dev Task | File | Type |
|---------|-----------------|------|------|
| `permit_sync` | `permit-sync` | `src/trigger/permit-sync.ts` | `schedules.task` `*/30 * * * *` |
| `permit_detail_scrape` | `permit-detail-scrape` | `src/trigger/permit-detail-scrape.ts` | `schedules.task` `*/10 * * * *` |
| `email_notification` | `email-sync` | `src/trigger/email-sync.ts` | `schemaTask` (webhook) |

## Remaining — Scheduled Jobs

These run on cron via pg_cron today. Each becomes a `schedules.task()`.

| Old Job | What It Does | Priority |
|---------|-------------|----------|
| `monday_status_sync` | Sync Monday.com board statuses | Medium |
| `sync_full` | Monday.com full board sync | Medium |
| `folder_watcher_poll` | Watch Outlook folders for new project folders | Medium |
| `estimate_linker_maintenance` | Link estimates to emails | Medium |
| `mailbox_fallback_sync` | Fallback mailbox sync | Low |
| `body_link_backfill` | Backfill body link scanning | Low |
| `group_sync` | Outlook group sync | Low |
| `subscription_renewal` | Subscription renewals | Low |
| `account_linking` | Batch account linking | Low |
| `contact_linking` | Batch contact linking | Low |
| `swppp_master_sync` | SWPPP master sync | Low |
| `attachment_backfill` | Backfill attachment parsing | Low |
| `contract_won_bridge` | Bridge contract-won events | Low |
| `aqdata_sync` | AQData export sync | Low |
| `aqdata_detail_scrape` | AQData detail enrichment | Low |
| `notifications_tick` | Notification timer tick | Low |

## Remaining — Event-Driven Jobs

These fire from webhooks or queue events. Each becomes a `task()` triggered via API.

| Old Job | Trigger Source | Priority |
|---------|---------------|----------|
| ~~`email_notification`~~ | ~~Outlook webhook~~ | **Done** → `email-sync` |
| `intake` | Document intake | **High** |
| `sync_item` | Monday webhook | Medium |
| `download_files` | Monday webhook | Medium |
| `dust_permit_payment` | Payment email detected | Medium |
| `dust_permit_issued_email` | Permit issued email detected | Medium |
| `contract_email_received` | Contract email detected | Medium |
| `contract_doc_extract` | Document extraction | Medium |
| `contact_enrichment` | On-demand enrichment | Medium |
| `email_triage_batch` | Batch triage | Medium |
| `estimate_triage` | Estimate classification | Medium |
| `link_estimate` | Estimate linking | Medium |
| `sync_bc_file` | BuildingConnected file | Medium |
| `body_link_manual_followup` | Manual trigger | Low |

## Email Pipeline (Redesign Target)

The `email_notification` webhook is the entry point for all email processing. The current flow is fragmented across multiple loosely-coupled queue jobs. The target is a clean, observable pipeline:

```sql
Outlook Webhook (new email)
│
├─► Step 1: Sync & Thread Link
│   ├── Fetch email body/metadata from Graph API
│   ├── Link to conversation thread (conversationId — idempotent)
│   └── Cascade thread attachment to related records
│
├─► Step 2: Contact & Account (parallel)
│   ├── Find or create contact from sender
│   ├── Enrich contact if not already enriched (PDL)
│   ├── Find or create account from sender domain
│   └── Enrich account if not already enriched (PDL)
│
├─► Step 3: Content Extraction (after Step 1)
│   ├── Scan email body + thread for links
│   │   ├── BuildingConnected links → Playwright download flow
│   │   └── Other downloadable links → HTTP fetch
│   ├── Download Outlook attachments
│   └── Process all files through document intake
│       ├── PDF/Office/Image → raw text extraction
│       └── LLM classification (existing, review needed)
│
└─► Step 4: Project/Estimate Matching (after Steps 2+3)
    ├── Attempt to match email to existing project
    ├── Attempt to match email to existing estimate
    └── If ambiguous → queue for manual review

Thread Link Background Job (continuous):
  - Watches for unlinked emails
  - Links via conversationId
  - Cascades project/account attachments through thread
  - Triggers downstream steps for anything newly linked
```

### Design Principles

- Each step is its own Trigger.dev task — visible, retriable, independently observable
- Steps 1 and 2 can run in parallel
- Step 3 waits for Step 1 (needs email body)
- Step 4 waits for Steps 2+3 (needs contacts + extracted content)
- Thread linking runs as a separate background job that cascades automatically
- All state in Supabase Postgres — Trigger.dev is orchestration only
