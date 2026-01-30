# Email + Contract Services Consolidation Plan

## Current State

Two services with overlapping concerns:

```text
services/email/          services/contract/
├── client.ts            ├── agents/           (7 extraction agents)
├── census/              ├── matching/         (estimate matching)
│   ├── db.ts            ├── pipeline/         (folder watcher)
│   ├── sync-all.ts      ├── extraction/       (PDF OCR)
│   ├── lib/             ├── reconcile.ts
│   │   ├── extract-attachments.ts  ← DUPLICATE
│   │   └── ...
│   └── inbox/           └── ...
└── ...
```css

**The gap:** Email service identifies 41+ contracts but doesn't feed them to the contract pipeline. Contract pipeline watches a local folder instead of pulling from census.

---

## Consolidation Decision Matrix

| Function | Email Service | Contract Service | Decision |
|----------|--------------|------------------|----------|
| Email ingestion | `sync-all.ts` | - | **KEEP in email** |
| Classification | `db.ts` (CONTRACT type) | - | **KEEP in email** |
| Account linking | `lib/link-accounts.ts` | - | **KEEP in email** |
| Platform extraction | `lib/platform-extraction.ts` | - | **KEEP in email** |
| PDF OCR | `lib/extract-attachments.ts` | `extraction/mcp-extractor.ts` | **DELETE email version, use contract** |
| Text storage | `attachments.extracted_text` | `contract_pages` table | **Use contract's (page-indexed)** |
| Deep analysis | - | 7 agents | **KEEP in contract** |
| Estimate matching | - | `matching/` | **KEEP in contract** |
| Reconciliation | - | `reconcile.ts` | **KEEP in contract** |
| Folder watcher | - | `pipeline/watcher.ts` | **DELETE, replace with DB source** |

---

## Phase 1: Clean Up Contract Service

### Files to DELETE (already deleted or obsolete)

```text
services/contract/
├── client.ts                    # DELETED (was SDK test)
├── contract.test.ts             # DELETED
├── test-sdk*.ts                 # DELETED
├── test-utils.ts                # DELETED
├── extraction/
│   ├── digital-extractor.ts     # DELETED (replaced by mcp-extractor)
│   ├── ocr-extractor.ts         # DELETED
│   └── text-extractor.ts        # DELETED
└── templates/_archive/          # DELETED
```css

### Files to REVIEW for deletion

```text
services/contract/
├── pipeline/watcher.ts          # Replace with DB-driven source
├── pipeline/dedup.ts            # May not need if using email IDs
├── chunker.ts                   # Redundant with extraction/storage
└── file-automation/             # Moved to services/file-automation/
```css

---

## Phase 2: Clean Up Email Service

### Files to DELETE or DEPRECATE

```text
services/email/census/
├── lib/extract-attachments.ts   # Use contract service's mcp-extractor instead
├── extract-attachments.test.ts  # Goes with above
└── (possibly others after review)
```css

### Keep These (core email functionality)

```text
services/email/
├── client.ts                    # Core Graph API client
├── types.ts                     # Email types
├── mcp-server.ts               # Claude tool access
├── groups.ts                    # M365 Groups
└── census/
    ├── db.ts                    # Census database (source of truth for emails)
    ├── sync-all.ts              # Email ingestion
    ├── sync-estimates.ts        # Monday estimates sync
    └── lib/
        ├── link-accounts.ts     # Account linking
        ├── platform-extraction.ts # Platform sender detection
        └── html-to-text.ts      # Body conversion
```css

---

## Phase 3: Build the Bridge

### New File: `services/contract/pipeline/email-source.ts`

Purpose: Pull contracts from census database instead of watching folder.

```typescript
/**
 * Email-driven contract source
 *
 * Replaces folder watcher with database-driven processing.
 * Pulls contracts identified by email census and feeds to pipeline.
 */

import { db } from '../../email/census/db';
import { downloadAttachment } from '../../email/client';
import { processContract } from './index';

interface ContractEmail {
  emailId: number;
  messageId: string;
  subject: string;
  attachmentId: string;
  attachmentName: string;
  storagePath: string | null;  // MinIO path if already downloaded
}

/**
 * Get unprocessed contract emails from census
 */
export function getUnprocessedContracts(): ContractEmail[] {
  return db.prepare(`
    SELECT
      e.id as emailId,
      e.message_id as messageId,
      e.subject,
      a.attachment_id as attachmentId,
      a.name as attachmentName,
      a.storage_path as storagePath
    FROM emails e
    JOIN attachments a ON a.email_id = e.id
    LEFT JOIN processed_contracts pc ON pc.email_id = e.id
    WHERE e.classification = 'CONTRACT'
      AND a.content_type = 'application/pdf'
      AND pc.id IS NULL
    ORDER BY e.received_at DESC
  `).all() as ContractEmail[];
}

/**
 * Process next contract from email census
 */
export async function processNextContract(): Promise<{
  processed: boolean;
  emailId?: number;
  subject?: string;
  error?: string;
}> {
  const contracts = getUnprocessedContracts();

  if (contracts.length === 0) {
    return { processed: false };
  }

  const contract = contracts[0];

  try {
    // Get PDF (from MinIO or download fresh)
    const pdfPath = contract.storagePath
      ? await getFromMinIO(contract.storagePath)
      : await downloadAndStore(contract);

    // Process through existing pipeline
    await processContract(pdfPath, {
      emailId: contract.emailId,
      messageId: contract.messageId,
    });

    return {
      processed: true,
      emailId: contract.emailId,
      subject: contract.subject,
    };
  } catch (error) {
    return {
      processed: false,
      emailId: contract.emailId,
      subject: contract.subject,
      error: String(error),
    };
  }
}

/**
 * Process all unprocessed contracts
 */
export async function processAllContracts(options?: {
  limit?: number;
  onProgress?: (current: number, total: number, subject: string) => void;
}): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ emailId: number; error: string }>;
}> {
  const contracts = getUnprocessedContracts();
  const limit = options?.limit ?? contracts.length;
  const toProcess = contracts.slice(0, limit);

  let processed = 0;
  let failed = 0;
  const errors: Array<{ emailId: number; error: string }> = [];

  for (let i = 0; i < toProcess.length; i++) {
    const contract = toProcess[i];
    options?.onProgress?.(i + 1, toProcess.length, contract.subject);

    const result = await processNextContract();

    if (result.processed) {
      processed++;
    } else if (result.error) {
      failed++;
      errors.push({ emailId: contract.emailId, error: result.error });
    }
  }

  return { processed, failed, errors };
}
```css

### Schema Update: Link contracts to emails

Add `email_id` to `processed_contracts` table:

```sql
ALTER TABLE processed_contracts ADD COLUMN email_id INTEGER REFERENCES emails(id);
ALTER TABLE processed_contracts ADD COLUMN message_id TEXT;
CREATE INDEX idx_processed_contracts_email ON processed_contracts(email_id);
```css

---

## Phase 4: Unified Data Model

### Current: Two separate databases

```text
services/email/census/census.db     services/contract/contracts.db (implicit)
├── emails                          ├── processed_contracts
├── attachments                     ├── contract_pages
├── accounts                        ├── contract_extractions
├── projects                        └── contract_matches
└── estimates
```css

### Target: Single source with clear ownership

**Option A: Keep separate, link by email_id**

- Census DB owns: emails, attachments, accounts, projects, estimates
- Contract DB owns: processed_contracts, contract_pages, contract_extractions, contract_matches
- Link via: `processed_contracts.email_id` → `emails.id`

**Option B: Merge into census DB**

- Add contract tables to census.db
- Single database, simpler queries
- Risk: 637MB DB gets bigger

**Recommendation: Option A** - Keep separate but linked. Contract processing is specialized and may need different retention/backup policies.

---

## Phase 5: CLI Commands

### New commands for contract processing

```bash
# Process next contract from inbox
bun services/contract/pipeline/email-source.ts --next

# Process all unprocessed contracts
bun services/contract/pipeline/email-source.ts --all

# Process specific email by ID
bun services/contract/pipeline/email-source.ts --email-id=123

# Show processing status
bun services/contract/pipeline/email-source.ts --status
```css

### Existing email commands (keep)

```bash
# Sync emails
bun services/email/census/sync-all.ts

# Sync estimates
bun services/email/census/sync-estimates.ts
```css

---

## Migration Checklist

### Immediate (can do now)

- [ ] Delete `services/email/census/lib/extract-attachments.ts` (use contract's mcp-extractor)
- [ ] Delete `services/email/census/extract-attachments.test.ts`
- [ ] Review `services/contract/pipeline/watcher.ts` for removal
- [ ] Add `email_id` column to `processed_contracts` schema

### Soon (after manual walkthrough)

- [ ] Create `services/contract/pipeline/email-source.ts`
- [ ] Update `processContract()` to accept email metadata
- [ ] Test with real contracts from census

### Later (once working)

- [ ] Remove folder watcher entirely
- [ ] Add CLI commands for email-driven processing
- [ ] Document new workflow

---

## Workflow After Consolidation

```text
1. Email arrives at contracts@desertservices.net
           ↓
2. sync-all.ts ingests to census DB
           ↓
3. Classification marks as "CONTRACT"
           ↓
4. email-source.ts pulls unprocessed contracts
           ↓
5. Contract pipeline:
   - Extract text (mcp-extractor)
   - Run 7 agents (billing, insurance, SOV, etc.)
   - Match to Monday estimate
   - Reconcile line items
           ↓
6. Human review via manual walkthrough
           ↓
7. Create Notion project, update Monday, etc.
```

---

## Questions to Resolve

1. **Attachment storage**: Keep in MinIO or download fresh each time?
   - Current: Some in MinIO, some not
   - Recommendation: Always store in MinIO, reference by path

2. **Project linking**: Who owns the `projects` table?
   - Current: Census DB
   - Recommendation: Keep in census, contract service just references

3. **Estimate sync frequency**: How often to pull from Monday?
   - Current: Manual via `sync-estimates.ts`
   - Recommendation: Daily cron or on-demand

4. **Error handling**: What happens when contract processing fails?
   - Current: Logged, status = 'failed'
   - Recommendation: Add retry queue, notification
