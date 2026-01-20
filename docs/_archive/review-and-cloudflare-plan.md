# BetterFleet — Architecture & Vision (Dec 2025)

> **This is the source of truth.** If any other doc conflicts with this, treat that doc as historical.

---

## 1. Vision Summary

**BetterFleet** is an internal operations platform that unifies:

- **Commercial workflow**: Quotes → Contract → Project onboarding → Permits
- **Field ops/dispatch**: Jobs → Drivers → GPS → Completion
- **Billing**: Products, conditions, invoicing, ERP sync

### MVP (End of Dec 2025)

- Quote builder + non-destructive versioning + PDF generation
- Contract attach + reconciliation UI
- Onboarding templates + per-project checklists
- Dust permit request + automation audit trail
- AI assistant: read-only + "draft quote" capability

### Ops Priority (2026)

1. **Watertrucks / Lotwashes** — service-only, still manual, greenfield
2. **Street Sweeping** — cross-street locations, dynamic routing
3. **Other lines** — Rolloffs, Toilets, SWPPP (already in CRO)

---

## 2. Locked Decisions

### 2.1 Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| **Web UI** | React + Vite + Tailwind + **shadcn/ui** | SPA hosted on Cloudflare Pages |
| **Mobile** | Expo + **React Native Reusables** | App store distribution |
| **API** | **Cloudflare Workers** + **Hono** | Workers + `pg` + Hyperdrive. No Prisma in Workers. |
| **DB** | **Supabase Postgres** + PostGIS enabled | ORM: **Drizzle** (Workers-compatible) |
| **Auth** | **Clerk** | Staff: Entra SSO via Clerk; Drivers: email/Google invite |
| **State** | **Legend State** | Or Zustand if simpler |
| **Forms** | React Hook Form + Zod | |
| **Maps** | **Google Maps** (full library) | [react-google-maps](https://github.com/visgl/react-google-maps) — Places, Routes, Markers, etc. |
| **PDF** | **pdfmake** | Already used in quoting app |
| **E-sign** | **DocuSign** (or Documenso open-source) | For signed contracts/quotes |
| **Docs storage** | **SharePoint** canonical + optional **R2** cache | |
| **Observability** | **Sentry** (errors + perf) | |
| **Product analytics** | **PostHog** | In-app behavior tracking |
| **Email** | **Resend** | Transactional emails |
| **AI** | AI SDK + **Cerebras** (speed) + **Gemini** (quality) | |
| **Background jobs** | **Cloudflare Queues** + Cron Triggers | Or Inngest if more orchestration needed |
| **Testing** | **bun test** (unit) + **Playwright** (e2e) | |
| **Calendar UI** | **shadcn calendar** | Built-in, sufficient for scheduling views |

### 2.2 Cloudflare Responsibilities

| Service | Use |
|---------|-----|
| **Pages** | Web console hosting |
| **Workers** | API + webhooks + lightweight background tasks |
| **Durable Objects** | Realtime hubs (dispatch board, GPS broadcast, chat) — later phases |
| **Queues + Cron** | Async work, scheduled jobs (recurring routes, invoice runs) |
| **R2** | File cache/backup (SharePoint remains canonical) |
| **Zero Trust / Access** | Optional layer if you want network-level SSO gating |

### 2.3 Database Connectivity (Workers + pg + Hyperdrive + Drizzle)

**Decision**: Workers-first with **Drizzle ORM** (no Prisma).

| Component | What | Link |
|-----------|------|------|
| **Connection** | `pg` driver + Hyperdrive pooling | [Cloudflare Workers + Postgres tutorial](https://developers.cloudflare.com/workers/tutorials/postgres/) |
| **ORM** | Drizzle (Workers-compatible, type-safe) | [Drizzle ORM](https://orm.drizzle.team/) |
| **Migrations** | Drizzle Kit | Runs locally, pushes to Supabase |

**Why not Prisma**: Prisma's query engine requires native binaries that don't run in Workers. Drizzle is pure JS/TS and works cleanly.

**Hyperdrive**: Cloudflare's connection pooler that caches + accelerates Postgres connections from Workers. Enable once you have real traffic.

### 2.4 Auth Flow

| User Type | Auth Method |
|-----------|-------------|
| **Office staff** | Clerk with Microsoft Entra SSO |
| **Drivers** | Clerk with email/Google (invite-only, app store distribution) |

Unified in DB as `users` with `role` and `user_type` columns.

### 2.5 AI Chat Integration

**Decision: Option B** — Import chat UI into the main console as a `/chat` route, sharing auth + UI shell.

Use the **latest AI SDK** patterns:

- **Server**: `streamText(...)` → `toDataStreamResponse()`
- **Client**: `useChat()` from `@ai-sdk/react`

Start **read-only** (answer questions, draft quotes). Tool-based actions (create job, etc.) come later.

### 2.6 Permits

| Item | Decision |
|------|----------|
| **Primary permit** | Dust permit |
| **Automation output** | Confirmation number + invoice PDF + application PDF |
| **Execution** | Separate service (Elysia API + BullMQ/cron + **Stagehand v3** + Chromium/Steel.dev) |
| **Trigger** | From BetterFleet or Notion — push to permit service |
| **Monitoring** | Dashboard for success/failures, man-in-the-middle capability (Steel.dev) |
| **Browser runner** | Steel.dev (preferred) or raw Chromium — not Browserbase |

**Architecture**: Permit automation is a **separate service** running on your local machine (or VM). BetterFleet triggers it via API or queue; it reports results back. Workers coordinate, don't run browser automation. Steel.dev provides man-in-the-middle capabilities for debugging/troubleshooting.

### 2.7 Geospatial + Route Optimization

**PostGIS**: Enabled from day 1 (Supabase has it). Use for territories, "jobs in area", distance queries.

**Route Optimization (VRP)** — Google Routes API (modern 2025 API):

| Tool | Type | Status | Cost | Use case |
|------|------|--------|------|----------|
| **Google Routes API** | Official Google | Active 2025 | Pay-per-use | Full VRP: waypoints, capacity, time windows, multi-vehicle |
| **[Google OR-Tools](https://developers.google.com/optimization/routing)** | Open source VRP solver | Active (Google) | Free | Full optimization: capacity, time windows, multi-vehicle |
| **[VROOM](https://github.com/VROOM-Project/vroom)** | Open source VRP | Active | Free | Simpler than OR-Tools, uses OSRM |
| **[OSRM](https://github.com/Project-OSRM/osrm-backend)** | Routing engine | Active | Free | Distance/time calculations (not full VRP) |

**Phase approach**:

- **MVP (WT/Sweeping)**: Manual route building + Google Maps for directions
- **Street Sweeping**: Start with **Google Routes API** (free tier available, pay-per-use)

**What is VRP?** Vehicle Routing Problem — algorithm finds optimal routes for multiple vehicles serving multiple locations with constraints (time windows, capacity, driver hours). Your street sweeping "calls coming in, routes updating" scenario is literally VRP.

---

## 3. Domain Model

Core hierarchy from CRO: **Account → Location → Job → Asset**

Plus commercial layer for quotes/contracts.

### 3.1 Core Entities

```
Account (customer / billing entity)
├── Location (service address; can be temporary/event)
│   ├── Job (delivery, pickup, service, swap, etc.)
│   │   └── Asset (deployed equipment)
│   └── ...
└── BillingGroup (shared pricing rules)

Project (commercial wrapper)
├── Quote → QuoteVersion → QuoteLineItem
├── Contract → ContractLineItem
├── OnboardingRun → ChecklistItem
├── PermitRequest → Permit → PermitRun/Attempt
└── Jobs (derived from SOV)

Driver, Truck
RecurringRoute → RouteStop
Invoice → InvoiceLineItem
Product, PriceAdjustment, Condition (billing rules)
Document (metadata → SharePoint/R2)
AuditLog
```

### 3.2 Key Invariants

1. **Never store PDFs as source of truth** — store structured data, generate PDFs on demand
2. **Jobs derived from Projects/Quotes but editable** — reality requires manual overrides
3. **Every automation run is auditable** — permits, invoices, route generation

---

## 4. Roadmap

### Phase 0 (Now → End of Dec 2025): Quotes-first MVP

- [ ] Cloudflare Pages + Workers scaffold
- [ ] Clerk auth wired (Entra SSO for staff)
- [ ] Supabase Postgres + PostGIS enabled
- [ ] UI shell with tabs/routes + `/chat` route
- [ ] Quote builder + versioning + PDF generation (pdfmake)
- [ ] Contract attach + reconciliation UI
- [ ] Onboarding templates + per-project checklists
- [ ] Permit request + audit trail (automation runs externally)
- [ ] AI assistant: read-only + draft quote

### Phase 1 (Jan–Feb 2026): Watertrucks / Lotwashes

- [ ] Account + Location + Job CRUD (service-only, no assets)
- [ ] Scheduling + dispatcher workflow
- [ ] Driver app v1: job ticket, start/pause/complete/fail, photos, notes
- [ ] Minimal map (jobs + driver dots) + GPS ingest

### Phase 2 (Mar–Apr 2026): Street Sweeping + Geospatial

- [ ] Cross-street / segment-based locations
- [ ] Territory/zone model (for dispatch views + pricing)
- [ ] Shift activity map + replay foundations

### Phase 3 (May–Aug 2026): Billing + ERP + Recurring

- [ ] Products/conditions engine (CRO-style)
- [ ] ERP sync pipeline (see [ERP section](#5-erp-options))
- [ ] Recurring routes / services
- [ ] Inspection scheduling + checklist PDFs

### Phase 4 (Sep–Dec 2026): Dispatch Maturity + Assets

- [ ] Asset deployment model (rolloffs, toilets, etc.)
- [ ] Deployed asset map + idle alerts
- [ ] Dispatch board polish + optimization
- [ ] AI assistant upgrades (RAG if needed)

---

## 5. ERP / Billing Architecture (Decision Made)

### Current State (from your research)

- **QuickBooks Enterprise Desktop (Contractor Edition)** — current ledger, auditor-facing
- **Siteline** — **already purchased and partially used** (change orders); NOT fully utilized
- **Pay apps used**: GC Pay, Textura, Procore
- **Ransomware history** — security-conscious, QB locked down via remote desktop

### Decision: Keep Siteline + QuickBooks (No ERP Migration)

**You don't need a new ERP right now.** Siteline + QuickBooks Enterprise is the right architecture. Siteline handles construction billing; QB remains the financial ledger.

```
BetterFleet (your app)
    │
    ├── Quotes/SOV/Projects → push to Siteline API
    │
    ▼
SITELINE (construction billing)           QUICKBOOKS ENTERPRISE
────────────────────────────              ──────────────────────
• Pay apps (G702/G703)                    • GL / Ledger
• GC portal submission                    • AR / AP
• Change orders                           • Financial reporting
• Lien waivers                            • Auditor-facing
• Retainage tracking                      • System of record
        │                                       ▲
        └────── Export IIF files ────────────────┘
                (or API in 2026)
```

### Siteline Workflow (from Tyler Helget)

**What goes into Siteline:**

- Pay applications (AIA G702/G703 forms)
- Change orders
- Lien waivers (automated generation)
- Retainage calculations
- GC portal submissions (GC Pay, Textura, Procore)
- SOV management and updates

**What goes into QuickBooks:**

- Final invoices (exported from Siteline as IIF files)
- GL entries
- AR/AP management
- Period close/auditor lockdown
- Financial reporting

**Current workflow (manual):**

1. Create/update SOV in Siteline
2. Generate pay apps in Siteline
3. Submit to GC portals via Siteline
4. Export final invoices as IIF files
5. Manually import IIF into QuickBooks

**Future workflow (early 2026):**
Siteline is adding QBO integration with "a lot more syncing capabilities" - could become real-time bidirectional sync.

### Alternative: Conductor.is Integration

**Conductor.is** provides typed APIs to QuickBooks Desktop/Enterprise for $49/company file/month. You could build AIA billing on top of QB instead of using Siteline.

**Conductor vs Siteline:**

| Aspect | Conductor.is + Custom AIA | Siteline + QB |
|--------|---------------------------|---------------|
| **Cost** | $49/month + dev time for AIA forms | Siteline subscription + QB |
| **AIA Forms** | Need to build/customize | 15,000+ pre-built forms |
| **GC Portal Integration** | Need to build | Built-in for major portals |
| **Lien Waivers** | Need to build | Automated generation |
| **Retainage** | Need to build | Built-in tracking |
| **Time to ship** | 3-6 months dev time | 2 weeks setup |
| **API** | Full QB access | Siteline API + file export |

**Recommendation:** Start with Siteline (you already pay for it). If you want full control, evaluate Conductor.is later.

### Why This Works

| Need | QuickBooks | Siteline | Notes |
|------|-----------|----------|-------|
| AIA billing (G702/G703) | ❌ | ✅ | Siteline has 15,000+ GC forms |
| Retainage tracking | ❌ | ✅ | Siteline does this |
| GC portal integration | ❌ | ✅ | GC Pay, Textura one-click; Procore is problematic |
| Month lockdown (auditors) | ✅ | ❓ | QB does period close; verify Siteline |
| Change order tracking | ❌ | ✅ | Already using Siteline for this |
| Lien waivers | ❌ | ✅ | Siteline's standout feature (6x faster) |
| GL / AR / Financials | ✅ | ❌ | QuickBooks remains the ledger |

### What Auditors Care About

1. **Period close / month lockdown** — QuickBooks does this
2. **Audit trail** — Siteline has revision history; QB has transaction log
3. **Separation of duties** — controlled access (both have this)
4. **Accurate financials** — GL/AR reconciliation in QB

### Action Items for Siteline

1. **Verify security** — SOC 2, 2FA (don't proceed without this given ransomware history)
2. **Request Siteline API docs** — Tyler offered to send them
3. **Fully utilize** — move pay app creation, lien waivers, retainage to Siteline
4. **BetterFleet integration** — push SOV/project data to Siteline via API
5. **Monitor 2026 QBO integration** — could eliminate file-based workflow

### If You Ever Need a "Real" ERP (Future)

| ERP | When | Why |
|-----|------|-----|
| **Acumatica Construction** | 50M+ revenue, unified construction accounting | Modern REST API, AIA native |
| **Sage Intacct** | Multi-entity, auditor pressure | Auditor darling, multi-subsidiary |
| **NetSuite** | Going enterprise | Full ERP, expensive |

**Bottom line**: Siteline + QB is the right answer for 2-3 years. BetterFleet integrates with Siteline. Conductor.is is a viable alternative if you want to build AIA on top of QB.

---

## 6. Open Questions (Remaining)

Most decisions are now locked. What's still TBD:

| # | Question | Impact | Notes |
|---|----------|--------|-------|
| 1 | **Siteline security verification** | Must verify before relying on it | 2FA, SOC 2 — ask Tyler Helget directly |
| 2 | **Steel.dev evaluation** | Permit automation debugging | Has man-in-the-middle capabilities; confirm it works with Stagehand v3 |
| 3 | **Google Routes API free tier** | VRP implementation | Check usage limits and pricing for Street Sweeping optimization |

### Decisions Now Locked

- ✅ **Compute**: Workers + pg + Drizzle (no Prisma)
- ✅ **ERP**: Keep Siteline + QuickBooks Enterprise (Conductor.is alternative)
- ✅ **Geospatial**: PostGIS enabled, use when needed
- ✅ **Permit runner**: Local machine, Stagehand v3, Steel.dev preferred
- ✅ **Route optimization**: Google Routes API (2025 modern API)

---

## 7. Reference Materials

### Current (use these)

- `docs/REVIEW_AND_CLOUDFLARE_PLAN.md` — this doc (source of truth)
- `docs/COMPREHENSIVE_RESEARCH.md` — CRO vs Fleetbase features, business lines, data model
- `cro-university/extracted_text/` — CRO training deck text (operational reality)

### Historical (superseded, keep for background)

- `docs/VERTICAL_SLICES.md`
- `docs/MODERNIZATION_STRATEGY_v2.md`
- `docs/DISPATCHBETTER_README.md`
- `docs/overall-stack-2025.md` — general tool preferences (some overridden)
- `docs/archive/*`

### External References

- [Cloudflare Workers + Postgres](https://developers.cloudflare.com/workers/tutorials/postgres/)
- [visgl/react-google-maps Autocomplete](https://github.com/visgl/react-google-maps/tree/main/examples/autocomplete)
- [AI SDK docs](https://sdk.vercel.ai/docs)
- [Clerk + Entra SSO](https://clerk.com/docs/authentication/social-connections/microsoft)

---

## 8. Services Checklist

Quick reference for all services in the stack:

| Category | Service | Status |
|----------|---------|--------|
| **Hosting** | Cloudflare Pages | ✅ Decided |
| **API** | Cloudflare Workers + Hono | ✅ Decided |
| **DB** | Supabase Postgres + PostGIS | ✅ Decided |
| **ORM** | Drizzle | ✅ Decided |
| **Connection pooling** | Hyperdrive | ✅ Decided |
| **Auth** | Clerk | ✅ Decided |
| **Maps** | Google Maps (react-google-maps) | ✅ Decided |
| **PDF** | pdfmake | ✅ Decided |
| **E-sign** | DocuSign (or Documenso) | ✅ Decided |
| **AI** | AI SDK + Cerebras + Gemini | ✅ Decided |
| **Errors** | Sentry | ✅ Decided |
| **Analytics** | PostHog | ✅ Decided |
| **Email** | Resend | ✅ Decided |
| **Docs** | SharePoint + R2 backup | ✅ Decided |
| **State** | Legend State | ✅ Decided |
| **Queues** | Cloudflare Queues | ✅ Decided |
| **Browser automation** | Stagehand v3 + Steel.dev or Chromium (separate service) | ✅ Decided |
| **Testing** | bun test + Playwright | ✅ Decided |
| **Calendar UI** | shadcn calendar | ✅ Decided |
| **ERP** | Keep Siteline + QuickBooks Enterprise | ✅ Decided |
| **Billing/AIA** | Siteline (already purchased) | ✅ Decided |
| **Route optimization** | Google Routes API (2025 modern API) | ⏳ Phase 2+ |

---

## 9. Key References

| Resource | Link |
|----------|------|
| **Cloudflare Workers + Postgres** | [Tutorial](https://developers.cloudflare.com/workers/tutorials/postgres/) |
| **react-google-maps** | [GitHub](https://github.com/visgl/react-google-maps) |
| **Google Maps JS Libraries** | [Docs](https://developers.google.com/maps/documentation/javascript/libraries) |
| **Google Routes API (VRP)** | [Docs](https://developers.google.com/maps/documentation/routes) |
| **Drizzle ORM** | [Docs](https://orm.drizzle.team/) |
| **AI SDK** | [Docs](https://sdk.vercel.ai/docs) |
| **Conductor.is (QB integration)** | [Website](https://conductor.is) |
| **Siteline API** | Ask Tyler Helget for docs (<tyler@siteline.com>) |

---

*Last updated: 2025-12-17*
