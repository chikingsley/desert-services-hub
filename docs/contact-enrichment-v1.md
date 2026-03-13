# Contact Enrichment V1

## Goal

Given a new or incomplete contact with an email address, search our existing email history for reliable evidence about that person and fill missing contact fields conservatively.

This is a separate async step. It must not run inline in email ingest.

## Why

We already have many contacts created from:

- Monday contact sync
- email ingest sender linking
- recipient linking (`to` / `cc`)
- manual/admin cleanup

Many of those contacts are incomplete. Common gaps:

- `title`
- `mobile_phone`
- `office_phone`
- `company_phone`
- `notes`

We do **not** want to:

- invent names from email local-parts
- do more regex-heavy signature parsing inline
- let contact enrichment create noisy accounts
- make destructive Monday changes automatically

## What Existed Before

Older ad hoc contact-enrichment work used these outcome buckets:

- `ENRICHED`
- `PARTIAL`
- `NO_MATCH`
- `INSUFFICIENT_EVIDENCE`
- `NOT_A_CONTACT`
- `DATA_MISMATCH`
- `DUPLICATE`

Common reasons observed in prior runs:

- no email history
- only automated bid emails
- only CC references
- functional mailbox (`bids@`, `estimating@`, `info@`, `office@`)
- name/email mismatch
- domain mismatch
- duplicate person already exists
- typo in email/domain

That older workflow was useful as a review model, but it was not a clean Trigger-owned product path.

## Existing Building Blocks

### Contacts schema

The `contacts` table already supports the main target fields:

- `title`
- `phone`
- `mobile_phone`
- `office_phone`
- `company_phone`
- `company_fax`
- `notes`
- `last_verified_at`
- `verification_source`

It also still has some older matching metadata fields:

- `contractor_matched`
- `contractor_search_notes`
- `contractor_searched_at`
- `phone_matched`

### Reusable LLM/email-history pattern

`apps/inbox-zero` already contains an agentic pattern for:

- searching email history
- collecting relevant evidence
- returning structured results

Relevant examples:

- `apps/inbox-zero/apps/web/utils/ai/reply/reply-context-collector.ts`
- `apps/inbox-zero/apps/web/utils/ai/meeting-briefs/generate-briefing.ts`

## V1 Scope

V1 should be intentionally small.

Input:

- `contactId`

Required contact preconditions:

- contact has a non-empty `email`
- contact is not internal Desert staff
- contact is not already obviously complete

V1 fills only missing fields:

- `title`
- `mobile_phone`
- `office_phone`
- `company_phone`
- optionally `notes` with short evidence summary

V1 does **not**:

- overwrite non-empty contact fields
- change contact `name`
- create or merge accounts
- move Monday groups
- push updates back to Monday automatically
- do web search or PDL lookup

## Candidate Selection

V1 should run for contacts that meet all of:

- `email IS NOT NULL`
- at least one of `title`, `mobile_phone`, `office_phone`, `company_phone` is missing
- not recently verified
- not a known system/internal sender

Suggested skip cases:

- `@desertservices.net`
- obvious relay/system senders
- obvious functional mailboxes:
  - `bids@`
  - `estimating@`
  - `info@`
  - `office@`
  - `noreply@`
  - `no-reply@`

Those should return `NOT_A_CONTACT` or be skipped entirely, depending on how much audit we want.

## Evidence Search Order

Search local email history in this order:

1. Direct sender hits
   - `LOWER(from_email) = LOWER(contact.email)`
2. Recipient hits
   - contact email present in `to_emails` or `cc_emails`
3. Existing explicit links
   - `contact_emails` rows already tied to the contact
4. Same-domain supporting context
   - optional: recent emails from same domain when direct hits are thin

Evidence ranking:

- strongest: direct emails from the contact
- medium: emails to the contact with signature block from the same person
- weak: CC-only or automated notifications
- unusable: relay/system emails with no person-level evidence

## LLM Task

The LLM should not guess. It should extract only what is explicitly supported by the supplied email evidence.

Structured output:

- `status`
- `confidence`
- `reason`
- `title`
- `mobilePhone`
- `officePhone`
- `companyPhone`
- `isFunctionalMailbox`
- `isDuplicate`
- `dataMismatch`
- `notes`
- `evidenceEmailIds`

Prompt rules:

- never invent missing values
- never infer a person from domain alone
- if evidence is weak or ambiguous, return `INSUFFICIENT_EVIDENCE`
- if no useful evidence exists, return `NO_MATCH`
- if mailbox is shared/role-based, return `NOT_A_CONTACT`
- if evidence conflicts with stored email/name/account, return `DATA_MISMATCH`

## Write Policy

Conservative writes only:

- write field only when current DB value is empty
- stamp `last_verified_at = now()`
- set `verification_source = 'contact_history_research_v1'`
- optionally append short machine note into `notes`

Do not auto-write for these statuses:

- `NO_MATCH`
- `INSUFFICIENT_EVIDENCE`
- `NOT_A_CONTACT`
- `DATA_MISMATCH`
- `DUPLICATE`

For those, just store the run result/audit trail.

## Recommended Status Semantics

### `ENRICHED`

Enough direct evidence to fill at least one missing field safely.

Examples:

- title appears in multiple signatures
- phone number repeatedly shown in direct messages

### `PARTIAL`

Some reliable evidence exists, but only enough for one field or only medium confidence.

V1 can either:

- treat this as writeable for one field, or
- collapse it into `ENRICHED` with lower confidence

Recommendation: keep `PARTIAL` in output, but allow safe writes for missing fields.

### `NO_MATCH`

No useful email history for this contact.

### `INSUFFICIENT_EVIDENCE`

Some history exists, but not enough to update safely.

Examples:

- only one email
- only automated bid traffic
- only CC references

### `NOT_A_CONTACT`

Mailbox is functional/shared/system and should not be treated as a person.

### `DATA_MISMATCH`

Evidence suggests the stored row is wrong.

Examples:

- contact name and email appear to belong to different people
- wrong account linkage
- typo in stored email/domain

### `DUPLICATE`

Evidence indicates this person already exists as another contact row.

## Trigger Shape

Recommended Trigger task:

- `contact-history-research`

Payload:

- `contactId`
- optional `force`

Separate scheduler:

- none for V1

Recommended invocation points:

- after Monday contact sync creates/updates a contact missing key fields
- after email ingest creates a new person contact with a real email
- manual/admin backfill

## Minimal Audit Storage

V1 should persist a run record somewhere instead of hiding failures.

Best option:

- new table: `contact_enrichment_runs`

Fields:

- `id`
- `contact_id`
- `status`
- `confidence`
- `reason`
- `proposed_updates` JSONB
- `evidence_email_ids` JSONB
- `applied` boolean
- `created_at`

If we want a faster first pass, the task can initially:

- write only to logs
- update `last_verified_at` / `verification_source` only on successful apply

But the table is the better long-term shape.

## V1 Implementation Order

1. Create `contact-history-research` spec/types/helper module
2. Add local SQL evidence queries over `emails` + `contact_emails`
3. Add LLM extractor with structured output
4. Add conservative apply step for missing fields only
5. Add `contact_enrichment_runs` audit table
6. Wire manual Trigger task
7. Later decide whether to auto-trigger on new contacts

## Non-Goals For V1

- web search
- PDL person enrichment
- signature OCR
- contact dedup merge automation
- account reassignment automation
- Monday writeback
- account creation from contact enrichment

## Recommendation

Build this as a small Trigger-owned async research task.

The first production version should answer one question only:

"Given this contact email, do we already have enough local email history to safely fill missing person fields?"

That is enough to be useful without reopening the mess in ingest.
