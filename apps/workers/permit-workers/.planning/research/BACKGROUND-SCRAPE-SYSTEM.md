# Background Scrape System — Research & Status

> **Date:** 2026-02-09
> **Status:** Research / Pre-implementation

## Executive Summary

We have a scraper that extracts **50+ fields** per permit from the Maricopa County portal. Our database only stores **24 columns** — and most of those are metadata, not scraped portal detail. We're leaving ~30 rich fields on the floor every time we scrape.

The idea: build a **background scraping queue** that continuously fills in permit detail data across all 2,031 existing permits (and growing), with the ability to **pause when real work comes in** (renewals, new permits, closures).

---

## 1. The Data Gap

### What the Scraper Extracts (PermitData — 50+ fields)

| Section | Fields | Currently Stored? |
|---------|--------|-------------------|
| **Header** | applicationId, projectName, companyName, status, createdDate, issueDate, expirationDate | Partially (missing createdDate/issueDate mapping) |
| **Contact** | email, name, phone | NO |
| **Applicant Company** | entityType, name, address1, address2, city, state, zip, phone, email | NO |
| **Applicant Owner** | firstName, lastName, address1, address2, city, state, zip, phone, email | NO |
| **isOwnerDeveloper** | boolean | NO |
| **Property Owner/Developer** | entityType, name, address(full), phone, fax, contactFirst, contactLast, contactPhone, contactEmail | NO |
| **Primary Contact** | firstName, lastName, title, email, companyName, onSitePhone, mobile, fax | NO |
| **Project** | name, description, startDate, endDate | Only startDate/endDate |
| **Site Location** | disturbedArea (acreage text) | NO |
| **Locations[]** | address, city, county, state, zip, parcel, lat, lng, isSelected | Only first address/city/parcel |
| **Access Points[]** | lat, lng (array) | NO |
| **Trackout E1** | answer (boolean), devices (5 booleans) | NO |
| **Water Methods** | 5 booleans (hose, waterTruck, waterPull, waterBuffalo, other) | NO |

### What the Database Stores (24 columns)

```text
id, project_name, account_id, project_id, company_name, portal_company_id,
status, submitted_date, effective_date, expiration_date, closed_date,
previous_app_id, project_start_date, project_end_date,
address, city, parcel, is_block_permit, is_accelerated,
invoice_number, invoice_charges, invoice_balance,
created_at, updated_at
```

### Fields We're Missing (~30+ fields not stored)

1. **Contact info** — who the permit gets sent to (email, name, phone)
2. **Applicant company full details** — entity type, full address, phone, email
3. **Applicant owner/president** — full name, address, contact info
4. **isOwnerDeveloper flag** — useful for knowing ownership structure
5. **Property owner/developer** — 13 fields when owner differs from applicant
6. **Primary project contact** — on-site contact, title, mobile, company
7. **Project description** — free-text description of the work
8. **Disturbed area** — acreage text (critical for pricing/tier)
9. **Full location data** — coordinates, county, state, zip (we only store first address/city/parcel)
10. **Access point coordinates** — lat/lng pairs
11. **Trackout control devices** — what devices are used
12. **Water control methods** — how dust is controlled

---

## 2. Current Infrastructure

### What EXISTS

| Component | Status | Location |
|-----------|--------|----------|
| `extractPermitData(page)` | Working | `src/portal/scrape.ts` |
| `runScrapeFlow(page, config)` | Working | `src/portal/scrape.ts` — iterates search results, skips existing, saves |
| `getPermitsNeedingScrape(limit)` | Working | `lib/db/repositories/dust-permit.ts` — finds permits where `updated_at = created_at` |
| `markPermitScraped(id, details)` | Working | `lib/db/repositories/dust-permit.ts` |
| `upsertPermit(data)` | Working | `lib/db/repositories/dust-permit.ts` — COALESCE-based upsert |
| `permitExists(id)` | Working | `lib/db/repositories/dust-permit.ts` |
| `searchPermits(criteria)` | Working | `src/portal/utils/search.ts` — by ID, project name, or company name |
| Shared browser session | Working | Singleton pattern, reuses Playwright session across requests |
| CLI `scrape` command | Working | `bun src/cli.ts scrape D0XXXXXX [--pdf]` |
| API endpoints | Working | `GET /api/scrape/:id` and `POST /api/scrape/pdf` |

### What DOES NOT EXIST

| Component | Status | Notes |
|-----------|--------|-------|
| BullMQ / any queue library | Not installed | Not in package.json |
| Redis | Not running | No container, no dependency |
| Background worker process | None | Everything is synchronous request/response |
| Job priority system | None | No concept of job priority |
| Pause/resume mechanism | None | No way to pause background work |
| Concurrency control | None | Single browser, no gating |
| DB columns for scraped detail | Missing | Only 24 columns vs 50+ available fields |
| `raw_data` JSONB column | Missing from dust_permits | (marketing_permits has this pattern) |
| `detail_scraped_at` timestamp | Missing | (marketing_permits has this) |

### Existing Pattern: marketing_permits

The `marketing_permits` table already uses this pattern:
- **`raw_data` JSONB column** — stores full scraped payload
- **`scraped_at` timestamp** — when the list-level scrape happened
- **`detail_scraped_at` timestamp** — when the detail page was scraped

This is exactly the pattern we should adopt for `dust_permits_filed_by_desert_services`.

---

## 3. Database Schema Strategy

### Approach: Hybrid (Indexed Columns + JSONB)

Add **frequently queried fields as real columns** (for WHERE clauses, JOINs, reporting) and store the **full PermitData blob as JSONB** (for anything else).

### New Columns to Add

```sql
-- Columns worth indexing/querying directly
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN disturbed_area text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN latitude text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN longitude text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN contact_email text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN contact_name text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN contact_phone text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN primary_contact_name text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN primary_contact_email text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN primary_contact_phone text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN applicant_entity_type text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN applicant_company_email text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN applicant_company_phone text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN project_description text;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN is_owner_developer integer;

-- Full scraped data blob + scrape tracking
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN raw_data jsonb;
ALTER TABLE dust_permits_filed_by_desert_services ADD COLUMN detail_scraped_at bigint;
```

### Why These Specific Columns?

- **disturbed_area** — pricing tier, renewal decisions, critical business field
- **latitude/longitude** — mapping, proximity searches, location validation
- **contact_email/name/phone** — who to reach about the permit
- **primary_contact_*** — on-site contact for field operations
- **applicant_entity_type** — LLC vs Corp vs Sole Prop matters for billing
- **applicant_company_email/phone** — company-level contact info
- **project_description** — useful for understanding scope
- **is_owner_developer** — ownership structure matters for renewals
- **raw_data** — everything else (trackout devices, water methods, access points, full location arrays, property owner details, applicant owner details)
- **detail_scraped_at** — distinguishes "scraped from list" vs "detail page visited"

### Fields That Stay in raw_data Only

These are valuable but rarely queried directly:
- Trackout E1 answer + device booleans
- Water method booleans
- Full applicant owner details (name, address)
- Full property owner/developer details
- Access point coordinate arrays
- Full location arrays (beyond primary)
- Applicant company full address

---

## 4. Queue Architecture Design

### Why BullMQ?

- Redis-backed, battle-tested job queue
- **Priority queues** — real work (priority 1) preempts scraping (priority 10)
- **Concurrency control** — limit to 1 job at a time (single browser)
- **Pause/resume** — `queue.pause()` / `queue.resume()` built-in
- **Job events** — progress tracking, completion callbacks
- **Retry with backoff** — handles portal flakiness
- **Dashboard** — Bull Board for monitoring (optional)

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **BullMQ** | Priority, pause/resume, mature ecosystem | Needs Redis |
| **Bun.redis + custom** | No extra deps, Bun-native | Reinventing the wheel |
| **SQLite job table** | Already have SQLite | No priority, no pause, limited |
| **Temporal/Inngest** | Full workflow engine | Overkill for this use case |

**Recommendation:** BullMQ. The priority queue and pause/resume are exactly what's needed, and Redis is lightweight.

### Queue Design

```text
┌─────────────────────────────────────────────────┐
│                  PERMIT QUEUE                     │
│                                                   │
│  Priority 1: Real Work                            │
│  ├── create-permit (new application)              │
│  ├── renew-permit (renewal)                       │
│  ├── close-permit (closure)                       │
│  └── revise-permit (revision)                     │
│                                                   │
│  Priority 10: Background Scrape                   │
│  └── scrape-detail (scrape + store permit data)   │
│                                                   │
│  Concurrency: 1 (single browser session)          │
│  Rate limit: 1 job per ~10 seconds (be nice)      │
└─────────────────────────────────────────────────┘
```

### Priority Preemption Flow

```text
1. Background scraping is running (priority 10)
   - Scraping D0045001... D0045002... D0045003...

2. Renewal comes in (priority 1)
   - Current scrape job finishes (can't interrupt mid-scrape)
   - Renewal job runs immediately (priority 1 > priority 10)
   - All queued scrape jobs wait

3. Renewal completes
   - Background scraping resumes automatically
```

### Pause/Resume for Manual Control

```bash
# CLI commands (new)
bun src/cli.ts queue pause     # Pause background scraping
bun src/cli.ts queue resume    # Resume background scraping
bun src/cli.ts queue status    # Show queue state
bun src/cli.ts queue drain     # Clear all pending scrape jobs

# API endpoints (new)
POST /api/queue/pause
POST /api/queue/resume
GET  /api/queue/status
```

### Worker Flow

```typescript
// Simplified worker logic
worker.process(async (job) => {
  const { page } = await getOrCreateBrowserSession();

  switch (job.name) {
    case 'scrape-detail': {
      const { permitId } = job.data;
      // Navigate to permit, extract data, save to DB
      await searchPermits(page, { permitId });
      const data = await extractPermitData(page);
      await saveFullPermitData(permitId, data);
      break;
    }
    case 'create-permit':
    case 'renew-permit':
    case 'close-permit':
      // Existing handler logic
      break;
  }
});
```

---

## 5. Scrape Strategy

### Phase 1: Backfill Existing Permits

We have **2,031 permits** in the database. At ~15 seconds per scrape (navigate, extract, save), that's:

- **~8.5 hours** of continuous scraping
- Running in background, this could complete in **1-2 days** with pauses for real work

**Order of scraping:**
1. **Active permits first** (313) — most useful for current operations
2. **Submitted permits** (4) — pending, need monitoring
3. **Closed permits** (686) — historical reference
4. **Superseded permits** (908) — lowest priority, but useful for renewal chains
5. **Rejected permits** (115) — lowest priority

### Phase 2: Ongoing Maintenance

After backfill:
- **New permits** get scraped immediately when created (already happens)
- **Re-scrape active permits** periodically (monthly?) to catch status changes
- **Scrape any permit that gets a status change notification**

### Phase 3: Full Portal Sweep (Optional Future)

The portal has **50,000+ permits** beyond our 2,031. The `marketing_permits` table is designed for this broader market intelligence sweep. Background scraping could eventually index the entire Maricopa County permit database.

---

## 6. Rate Limiting & Portal Etiquette

### Constraints

- The Maricopa County portal is an Oracle ADF app — not designed for high throughput
- We're a legitimate user (Desert Services has a login/account)
- But we shouldn't hammer it

### Proposed Limits

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Jobs per minute** | 4 | ~15 seconds per job is natural pace |
| **Concurrent jobs** | 1 | Single browser session |
| **Delay between jobs** | 2-5 seconds | Brief pause between scrapes |
| **Max retries** | 3 | Portal sometimes has hiccups |
| **Backoff** | Exponential (30s, 60s, 120s) | Don't hammer on failures |
| **Operating hours** | 24/7 (background) | Portal is always up |
| **Pause on errors** | After 5 consecutive failures | Something's wrong, stop and alert |

---

## 7. Implementation Checklist

### Prerequisites

- [ ] Install Redis (Docker container alongside Supabase)
- [ ] Add `bullmq` to permit-workers package.json

### Database Changes

- [ ] Add new columns to `dust_permits_filed_by_desert_services` (ALTER TABLE)
- [ ] Add `raw_data` JSONB column
- [ ] Add `detail_scraped_at` timestamp column
- [ ] Update `Permit` type in `lib/db/types.ts`
- [ ] Update `UpsertPermitData` type
- [ ] Update `upsertPermit()` repository function
- [ ] Update `parsePermitRow()` function

### Queue Infrastructure

- [ ] Create queue configuration (`src/queue/config.ts`)
- [ ] Create worker process (`src/queue/worker.ts`)
- [ ] Create job definitions and types (`src/queue/types.ts`)
- [ ] Create queue management functions (pause, resume, status)
- [ ] Integrate existing handlers with queue (create, renew, close)

### Scrape Enhancement

- [ ] Create `saveFullPermitData()` — maps PermitData to DB columns + raw_data
- [ ] Create `scrapeDetailJob()` — single permit scrape-and-store worker
- [ ] Create `enqueueBackfill()` — batch-enqueue permits needing detail scrape
- [ ] Add progress tracking (how many scraped, how many remaining)

### CLI & API

- [ ] Add `queue pause/resume/status/drain` CLI commands
- [ ] Add `/api/queue/*` endpoints
- [ ] Add `backfill start/status` commands

### Monitoring

- [ ] Log scrape progress (X/2031 complete)
- [ ] Alert on consecutive failures
- [ ] Optional: Bull Board dashboard

---

## 8. Open Questions

1. **Redis location** — Run as part of the existing docker-compose, or standalone? (Supabase stack already has Redis for Supabase internal use — can we piggyback, or should we spin up a separate one?)

2. **Column count** — Do we want to add all ~15 new columns listed above, or start smaller (just raw_data + detail_scraped_at) and add indexed columns as needed?

3. **Existing handlers** — Should create/renew/close be migrated to the queue immediately, or should we start with just background scraping in the queue and migrate the rest later?

4. **Marketing permits vs dust permits** — The marketing_permits table already has raw_data. Should the background scraper feed both tables (ours + market intelligence), or keep them separate?

5. **Portal session management** — Currently one shared browser session. With a queue worker, does this session live in the worker process? What happens if the API server also needs to use the browser?

---

## 9. Files Referenced

| File | What It Does |
|------|-------------|
| `apps/workers/permit-workers/src/portal/scrape.ts` | Core scraping: `extractPermitData()`, `runScrapeFlow()` |
| `apps/workers/permit-workers/src/portal/types.ts` | `PermitData` interface (50+ fields) |
| `apps/workers/permit-workers/src/api/scrape.ts` | HTTP endpoints for scraping |
| `apps/workers/permit-workers/src/handlers/scrape.ts` | Handler layer for scrape operations |
| `apps/workers/permit-workers/src/commands/scrape.ts` | CLI command for scraping |
| `lib/db/types.ts` | `Permit`, `UpsertPermitData` types (24 fields) |
| `lib/db/repositories/dust-permit.ts` | All DB operations: upsert, query, `getPermitsNeedingScrape()` |
| `apps/workers/permit-workers/.planning/codebase/CONCERNS.md` | Known gaps: no retry, no concurrency, no audit trail |
| `apps/workers/permit-workers/.planning/research/FEATURES.md` | Confidence-gated execution design (not implemented) |
