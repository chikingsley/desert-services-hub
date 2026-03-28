# Dust Permit Change Catalog

Date: 2026-03-13

## Purpose

This document inventories the current uncommitted dust-permit-related changes,
ties them to the problem they were trying to solve, and separates:

- changes that are currently present in the worktree
- changes that were attempted in-session and then reverted
- places where tests/docs are now ahead of the current code

The goal is to make the next cleanup pass manual and boring: pick one feature,
redo it in the right layer, commit it, move on.

## Method

- `git status --short` and `git diff --numstat` on `apps/dust-permits`,
  `apps/dust-permits-mcp`, and permit docs
- direct file reads for untracked files, because `git diff` does not explain them
- `chat-sync search` for the key filing failures and follow-up fixes:
  - `Add Site Drawing`
  - `existing company new company presidentOwner`
  - `date application year`
  - `submit draft pay expedited`
  - `portalCompanyId popup company match`
  - `propertyOwner isDifferent`

## Scope

Included:

- `apps/dust-permits/**`
- `apps/dust-permits-mcp/**`
- permit-specific docs under `docs/`
- dust-permit tests

Excluded:

- unrelated repo dirt outside the permit system

## Current Uncommitted Feature Batches

### 1. NOI Resolution, Triage, And County Lookup

Why this was attempted:

- repeated filing work started from NOI PDFs
- we needed to know whether an NOI qualified before starting browser automation
- we needed direct county parcel lookup helpers outside the stricter create path

Files:

- `apps/dust-permits/src/api/noi.ts`
- `apps/dust-permits/src/lib/noi-endpoints.ts`
- `apps/dust-permits/src/lib/noi-triage.ts`
- `apps/dust-permits/src/api/maricopa.ts`
- `apps/dust-permits/src/api/pima.ts`
- `apps/dust-permits/src/lib/pima-gis.ts`
- `apps/dust-permits/src/index.ts`
- `apps/dust-permits/scripts/county-lookup.ts`
- `apps/dust-permits-mcp/client.ts`
- `apps/dust-permits-mcp/src/tools.ts`
- `apps/dust-permits-mcp/types.ts`
- `apps/dust-permits/docs/api.md`

What this batch adds:

- `POST /api/noi/resolve`
- `POST /api/noi/create`
- `POST /api/maricopa/lookup`
- `POST /api/pima/lookup`
- MCP tools:
  - `permit_noi_resolve`
  - `permit_noi_create`
  - `permit_maricopa_lookup`
  - `permit_pima_lookup`
- local CLI helper:
  - `bun apps/dust-permits/scripts/county-lookup.ts ...`

Current state:

- present and uncommitted

Important note:

- `apps/dust-permits/src/api/noi.ts` is not just “resolve NOI”
- it currently:
  - resolves the NOI
  - checks county
  - resolves parcel acreage
  - triages permit pricing tier
  - chooses `new-company` vs `existing-company`
  - builds `FormData` overrides
  - can call `handleCreatePermit`

This is the main place where the current architecture drift is visible.

### 2. Company-Flow And NOI Payload Guardrails

Why this was attempted:

- Chandler Bay / Stevens Leinweber fell from `existing-company` to `new-company`
- project contact data ended up in `presidentOwner`
- NOI-derived strings were inconsistently cased
- NOI construction dates overrode the permit window

Files:

- `apps/dust-permits/src/api/noi.ts`
- `docs/dust-permit-automation-guardrails-2026-03-11.md`
- `docs/plans/2026-03-12-dust-permit-minimal-fix-plan.md`
- `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts`
- `tests/apps/dust-permits/unit/create-effective-flow.test.ts`
- `tests/apps/dust-permits/unit/popup-company-match.test.ts`

What this batch is trying to enforce:

- preflight decides `existing-company` vs `new-company`
- `presidentOwner` stays separate from project contact
- NOI human-readable fields are title-cased before use
- new permit dates come from permit defaults, not NOI construction dates

Current state:

- partially present in code
- clearly present in docs
- partially present in tests

Important note:

- the test/doc side is ahead of the current browser code
- `tests/apps/dust-permits/unit/popup-company-match.test.ts` expects
  `companyRowMatchesName` to be exported from `popup.ts`, but current
  `popup.ts` does not export it
- `tests/apps/dust-permits/unit/create-effective-flow.test.ts` expects
  fail-fast behavior for `existing-company` fallback, but current `flow.ts`
  does not currently carry that logic

### 3. Page 2 Map / Site-Drawing Resilience

Why this was attempted:

- create runs were failing with `Add Site Drawing button not found`
- copied applications can show `Edit Site Drawing` instead of `Add Site Drawing`
- page detection was too willing to trust hidden DOM

Chat-history evidence:

- `Add Site Drawing`
- `Edit Site Drawing`

Files:

- `apps/dust-permits/src/portal/create/fill/page2/map.ts`
- `apps/dust-permits/src/portal/utils/helpers.ts`
- `apps/dust-permits/src/portal/utils/selectors/portal.ts`
- `tests/apps/dust-permits/unit/map-open.test.ts`
- `tests/apps/dust-permits/unit/page2-detection.test.ts`

What this batch changes:

- Page 2 opener navigates with `goToPage(page, 2)` instead of ad hoc clicking
- Page 2 opener accepts either `Edit Site Drawing` or `Add Site Drawing`
- page detection uses visibility checks, not only selector counts
- Page 2 markers accept both `alt` and `title` variants for the buttons

Current state:

- present and uncommitted

This batch is directly tied to the filing failures we actually saw.

### 4. Application-Create Navigation Wait

Why this was attempted:

- some create runs appeared to succeed in the portal while the automation
  timed out or lost context during navigation

Files:

- `tests/apps/dust-permits/unit/application-create-wait.test.ts`

Current state:

- the test exists and is untracked
- the corresponding production change in `application.ts` is not currently dirty

Interpretation:

- this is a test-ahead-of-code artifact from an earlier attempted fix
- it should not be treated as a finished feature

### 5. Direct Draft Submit/Pay Path

Why this was attempted:

- a route was added to resume an existing draft and push it through submit/pay
- it was then used in the wrong authorization context

Chat-history evidence:

- `submit draft pay expedited`

Files:

- `apps/dust-permits/src/api/permits.ts`
- `apps/dust-permits/src/index.ts`
- `apps/dust-permits-mcp/client.ts`
- `apps/dust-permits-mcp/src/tools.ts`
- `apps/dust-permits-mcp/types.ts`

What this batch adds:

- `POST /api/permits/:id/submit-draft-and-pay`
- MCP tool `permit_submit_draft_and_pay`

Current state:

- present and uncommitted

Risk:

- this is the highest-risk dirty batch
- the current chat history already established that this route is the unsafe path
  that crossed the submit/pay authorization boundary

### 6. Draft Scrape Rejection

Why this was attempted:

- scraping a `Draft` permit is misleading
- draft permits are not final county records

Files:

- `apps/dust-permits/src/api/scrape.ts`
- `tests/apps/dust-permits/e2e/scrape.test.ts`

What this batch changes:

- scrape routes now reject draft permit IDs with a `409`

Current state:

- present and uncommitted

### 7. Access-Point Inference From Street Centerlines

Why this was attempted:

- the existing map builder used parcel centroid fallback for access points
- a separate improvement pass attempted to infer better access points from
  nearby Maricopa street centerlines

Chat-history evidence:

- `access point street centerline site drawing`

Files:

- `apps/dust-permits/src/lib/site-drawing.ts`

What this batch changes:

- queries nearby Maricopa street centerlines
- scores parcel boundary points by road proximity
- injects inferred access points into map data
- falls back to centroid if nothing better is found

Current state:

- present and uncommitted

Important note:

- this is a separate feature batch from the `Add/Edit Site Drawing` failure
- it should not be treated as part of the minimal Page 2 fix

### 8. Renewal Coordinator Selector Expansion

Why this was attempted:

- renewal copies shift Page 3 indices
- existing selectors were too narrow for copied/renewed applications

Files:

- `apps/dust-permits/src/portal/utils/selectors/page3.ts`

What this batch changes:

- extends selector fallbacks for the Page 3 coordinator radio buttons

Current state:

- present and uncommitted

### 9. DB Import-Path Migration Inside Dust Permits

Why this was attempted:

- dust-permit code is being moved from `@lib/db/repositories/*` to
  `@dust-permits/db/*`

Files:

- `apps/dust-permits/src/api/permits.ts`
- `apps/dust-permits/src/lib/permit-records.ts`
- `apps/dust-permits/src/portal/sync-service.ts`
- `tests/apps/dust-permits/e2e/scrape.test.ts`

Current state:

- partially present and uncommitted

Important note:

- `apps/dust-permits/src/portal/create/flow.ts` still imports
  `@lib/db/repositories/dust-permit`
- that mismatch is part of why the current unit test baseline is broken

### 10. Global Default Flip For `propertyOwner.isDifferent`

Why this was attempted:

- an earlier session changed the default globally from `false` to `true`

Chat-history evidence:

- `propertyOwner isDifferent`

Files:

- `apps/dust-permits/src/form-data.ts`

Current state:

- present and uncommitted

Important note:

- this change is high-risk
- chat history also contains explicit user guidance that this should default to
  `false` unless intentionally overridden
- this line should be treated as suspect until re-reviewed manually

### 11. Validation-Layer Cleanup

Why this was attempted:

- cleanup around Zod validation / conditional rules

Files:

- `apps/dust-permits/src/lib/form-data-validation.ts`

Current state:

- present and uncommitted

Important note:

- this diff looks mostly structural rather than feature-bearing
- it still needs review, but it is not currently tied to the filing failures

### 12. Scottsdale Probe / Reverse-Engineering Asset Refresh

Why this was attempted:

- separate Scottsdale records-pull experiment work

Chat-history evidence:

- `scottsdale probe`

Files:

- all currently modified files under:
  `apps/dust-permits/experiments/scottsdale-records-pull/scottsdale-probe-2026-02-26/`

This includes the modified bundle/js/json artifacts for:

- `app.bundle.js`
- `buildingpermitreports.bundle.js`
- `buildingpermitsearch.bundle.js`
- `casesearch.bundle.js`
- `dmsearch.bundle.js`
- `dmsearch.js`
- `helpmodalshared.bundle.js`
- `payload-buildingpermit-empty.json`
- `payload-buildingpermit.json`
- `payload-dmsearch-case.json`
- `payload-dmsearch.json`
- `propertyrequest.bundle.js`
- `propertyrequest.pretty.js`
- `rowpermitsearch.bundle.js`
- `sortmodalshared.bundle.js`
- the modified result payloads under:
  `.../results/`

Current state:

- present and uncommitted

Important note:

- this batch is unrelated to the current Maricopa dust-permit filing workflow
- it should be reviewed or parked separately from permit automation fixes

### 13. Permit App Metadata / Local Instructions

Files:

- `apps/dust-permits/AGENTS.md`

Current state:

- untracked
- not behavior-bearing

## Attempted In This Session And Then Reverted

This is the `portalCompanyId` attempt that was rejected and backed out.

### Goal Of The Attempt

- stop popup company selection from guessing by normalized row text
- carry the exact company identity already known in preflight into the create
  flow and popup execution

### Files Touched During The Attempt

Browser-side files that were changed and then reverted:

- `apps/dust-permits/src/portal/create/popup.ts`
- `apps/dust-permits/src/portal/create/application.ts`
- `apps/dust-permits/src/portal/create/flow.ts`
- `apps/dust-permits/src/portal/types.ts`

API/test files that were changed during the attempt and then had only the
`portalCompanyId` hunks backed out:

- `apps/dust-permits/src/api/noi.ts`
- `apps/dust-permits/src/api/permits.ts`
- `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts`
- `tests/apps/dust-permits/unit/create-effective-flow.test.ts`
- `tests/apps/dust-permits/unit/popup-company-match.test.ts`

Temporary test added and then deleted:

- `tests/apps/dust-permits/unit/create-api-portal-company-id.test.ts`

### Why It Was Attempted

- the plan in `docs/plans/2026-03-12-dust-permit-minimal-fix-plan.md`
  identified exact existing-company selection by `portalCompanyId` as the next
  hardening task

### Why It Was Rejected

- it touched too many create/popup files at once
- it pushed more browser-side plumbing into a part of the system already under
  architecture review
- it was not presented as a sufficiently small diff relative to the current
  state of the repo

### Current State

- no commit was made
- the browser-side files above are back to baseline
- only the older unrelated dirt in `api/noi.ts` and `api/permits.ts` remains

## Current Inconsistencies To Fix Before Trusting The Test Baseline

These are not new feature ideas. They are current mismatches in the dirty tree.

- `tests/apps/dust-permits/unit/popup-company-match.test.ts`
  expects `companyRowMatchesName` to exist, but `popup.ts` does not export it.
- `tests/apps/dust-permits/unit/application-create-wait.test.ts`
  expects transient navigation handling that is not currently in dirty
  `application.ts`.
- `tests/apps/dust-permits/unit/create-effective-flow.test.ts`
  expects `existing-company` fail-fast behavior, but current `flow.ts` no
  longer carries that dirty change.
- `apps/dust-permits/src/portal/create/flow.ts`
  still uses the old DB import alias and does not line up with the partial
  import-path migration.
- `apps/dust-permits/src/form-data.ts`
  currently defaults `propertyOwner.isDifferent` to `true`, which conflicts
  with prior user guidance recovered from chat history.

## Recommended Manual Redo Order

If this is going to be redone one feature at a time, the least confusing order is:

1. Decide whether `propertyOwner.isDifferent` should be reverted immediately.
2. Separate the unsafe `submit-draft-and-pay` batch from everything else.
3. Separate the NOI/GIS surface area from the policy inside `api/noi.ts`.
4. Redo the Page 2 `Add/Edit Site Drawing` fix as a small batch.
5. Only after that, revisit exact existing-company selection.

## Short Summary

The current dirty permit worktree is not one feature. It is at least six:

- NOI qualification and county lookup
- NOI payload/policy guardrails
- Page 2 map resilience
- direct draft submit/pay
- access-point inference
- unrelated Scottsdale probe assets

The rejected `portalCompanyId` attempt is not currently in the code. The bigger
problem is that several older dirty batches are still mixed together and some of
the new tests/docs now describe behavior that the current code no longer has.
