# Dust Permit Minimal Fix Plan

Date: 2026-03-12

## Why This Exists

The permit workflow has accumulated multiple fixes under production pressure. Some of those fixes were correct, but several risks now overlap:

- adding logic at the wrong layer
- re-solving problems that already have a source of truth elsewhere
- touching already-dirty files without first understanding the existing diff
- letting browser-automation fixes absorb problems that should be handled in preflight or request building

This document is the narrow implementation plan for the next round of permit hardening. The goal is not "more automation." The goal is to regress back toward the original design:

- minimal operator input
- central defaults and validation
- exact preflight decisions before browser work starts
- browser automation as a thin executor, not the policy layer

## Implementation Rules

1. Prefer boundary fixes over portal/UI fixes.
2. One problem should have one source of truth.
3. Do not add new behavior to browser fill code if the same decision can be made in request build or preflight.
4. Before editing any already-dirty file, inspect the current diff and preserve unrelated work.
5. Every task must name its minimal file set and its validation path before code changes start.

## Current Dirty State Relevant To This Plan

These permit files are already modified or untracked and must be reviewed before editing:

- `apps/dust-permits/src/api/permits.ts`
- `apps/dust-permits/src/form-data.ts`
- `apps/dust-permits/src/portal/create/popup.ts`
- `apps/dust-permits/src/portal/create/flow.ts`
- `apps/dust-permits/src/portal/create/application.ts`
- `apps/dust-permits/src/portal/create/fill/page2/map.ts`
- `apps/dust-permits/src/portal/utils/selectors/page3.ts`
- `apps/dust-permits/src/portal/utils/selectors/portal.ts`
- `apps/dust-permits/src/portal/types.ts`
- `apps/dust-permits/src/api/noi.ts` (untracked)
- `apps/dust-permits/src/api/maricopa.ts` (untracked)
- `tests/apps/dust-permits/unit/application-create-wait.test.ts` (untracked)
- `tests/apps/dust-permits/unit/create-effective-flow.test.ts` (untracked)
- `tests/apps/dust-permits/unit/map-open.test.ts` (untracked)
- `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts` (untracked)
- `tests/apps/dust-permits/unit/page2-detection.test.ts` (untracked)
- `tests/apps/dust-permits/unit/popup-company-match.test.ts` (untracked)

This plan assumes diff-on-diff review, not blind edits.

## Already Established Contracts

These are not new ideas and should not be reimplemented in another layer:

- Centralized defaults already exist in `DEFAULTS` and `buildFormData()` in [`apps/dust-permits/src/form-data.ts`](/home/simon/github/desert-services-hub/apps/dust-permits/src/form-data.ts#L694).
- Active create requests already build and validate `FormData` in [`apps/dust-permits/src/api/permits.ts`](/home/simon/github/desert-services-hub/apps/dust-permits/src/api/permits.ts#L343).
- Minimal existing-company input is already a tested contract in [`tests/apps/dust-permits/e2e/create-existing-minimal.test.ts`](/home/simon/github/desert-services-hub/tests/apps/dust-permits/e2e/create-existing-minimal.test.ts#L43).
- DB-side company match already returns `portalCompanyId` in [`apps/dust-permits/src/db/dust-permit.ts`](/home/simon/github/desert-services-hub/apps/dust-permits/src/db/dust-permit.ts#L365).
- Guardrails from the prior failure pass are already recorded in [`docs/dust-permit-automation-guardrails-2026-03-11.md`](/home/simon/github/desert-services-hub/docs/dust-permit-automation-guardrails-2026-03-11.md#L14).

## Task 0: Dirty-File Audit Gate

### Goal

Before any implementation task below, inspect the current diff for every touched file and confirm whether the relevant logic is:

- already present but incomplete
- present and wrong-layered
- unrelated and should be left alone

### Why This Layer

This is process, not product logic. The repo is already dirty. Minimal edits are impossible if we skip diff review.

### Files

- No new product files
- Use `git diff -- <file>` on each file listed under the relevant task before editing

### Minimal Change Rule

No code change until the current diff on the targeted files is understood.

### Validation

- For each task, attach a short "pre-edit diff review" note in the implementation PR or commit message.

## Task 1: Exact Existing-Company Selection By `portalCompanyId`

### Problem

Company identity is already resolved in the DB layer, but popup selection still works by normalized company-name text. That means the right answer is known before browser execution, but the executor is still guessing.

### Why This Layer

The source of truth is the DB match result, not popup row text. The browser layer should execute an exact company choice that was already made upstream.

### Minimal File Set

- `apps/dust-permits/src/api/permits.ts`
  Add optional `portalCompanyId` to create input so create can carry exact company identity.
- `apps/dust-permits/src/api/noi.ts`
  Pass `portalCompanyId` through create payload when preflight matched a known company.
- `apps/dust-permits/src/portal/types.ts`
  Extend create options/types to carry `portalCompanyId`.
- `apps/dust-permits/src/portal/create/application.ts`
  Thread `portalCompanyId` into popup handling for existing-company create.
- `apps/dust-permits/src/portal/create/popup.ts`
  Select the exact row by company ID when present; keep name-based matching only as fallback when no ID exists.
- `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts`
  Assert that matched-company create payload includes `portalCompanyId`.
- `tests/apps/dust-permits/unit/popup-company-match.test.ts`
  Assert exact ID selection beats normalized text matching.

### Files Explicitly Not To Change First

- `apps/dust-permits/src/db/dust-permit.ts`
  `portalCompanyId` is already returned here. Do not reopen DB matching logic unless a concrete defect is found.

### Minimal Change Rule

Do not redesign company matching. Do not add a second company-resolution path. Only plumb the already-known company identity into create.

### Validation

- Unit: matched-company create payload includes `portalCompanyId`
- Unit: popup selects by ID when available
- Unit: existing-company flow still fails fast if popup cannot honor preflight
- Typecheck: `bunx tsc --noEmit -p apps/dust-permits/tsconfig.json`
- Live smoke: one known-company draft create through MCP, verify no `new-company` fallback

## Task 2: APN Preflight Validation And Suggestion

### Problem

Malformed or stale APNs are being discovered during filing work instead of before filing work. That is a preflight problem, not a map-drawing problem.

### Why This Layer

APN validity belongs at parcel-resolution time. The browser should receive a resolved site target, not try to infer what the user meant from broken parcel input.

### Minimal File Set

- `apps/dust-permits/src/api/maricopa.ts`
  Add stricter APN validation and suggestion behavior for parcel lookups.
- `apps/dust-permits/src/lib/assessor.ts`
  Only if required to support suggestion lookup against alternate APN field shapes; avoid broader refactors.
- `tests/apps/dust-permits/api/assessor.test.ts`
  Add cases for malformed APNs and unique-suggestion responses.
- `tests/apps/dust-permits/unit/`
  Add a focused test file for Maricopa lookup suggestion behavior.

### Files Explicitly Not To Change First

- `apps/dust-permits/src/portal/create/*`
  Phase 1 should not touch browser code.

### Minimal Change Rule

Prefer "fail with county-backed suggestions" over silent auto-correction. Only auto-correct when there is exactly one unambiguous county match.

### Validation

- Unit/API: exact APN still resolves
- Unit/API: malformed APN returns deterministic suggestion payload
- Unit/API: ambiguous APN returns an error with candidates, not a guessed parcel
- Live smoke: APN cases that currently 404 can be diagnosed before create begins

## Task 3: Multi-Parcel Site Support

### Problem

The current create path is still single-parcel-centric. Jobs spanning multiple APNs require manual work or ad hoc parcel choices, which is the wrong failure mode.

### Why This Layer

This is a true missing capability. It does belong in the site-drawing and Page 2 path, because the system needs to construct and submit map geometry for more than one parcel.

### Minimal File Set

- `apps/dust-permits/src/lib/site-drawing.ts`
  Add multi-parcel geometry assembly and map-data creation.
- `apps/dust-permits/src/portal/create/flow.ts`
  Accept resolved multi-parcel map data instead of assuming one parcel source.
- `apps/dust-permits/src/portal/create/fill/page2/page2.ts`
  Support map draw + row selection when there is a primary parcel plus additional parcel geometry.
- `apps/dust-permits/src/portal/create/fill/page2/map.ts`
  Only if needed for polygon rendering/extent logic over merged geometry.
- `apps/dust-permits/src/portal/types.ts`
  Extend map-related types if current types are single-parcel-only.
- `tests/apps/dust-permits/unit/`
  Add focused tests for multi-parcel map-data generation and primary parcel selection.

### Files Explicitly Not To Change First

- `apps/dust-permits/src/form-data.ts`
  Do not redesign the top-level form schema for this first pass unless the current shape absolutely cannot carry the data.

### Minimal Change Rule

Support multi-parcel geometry by adding one narrow resolved-map-data path. Do not redesign the whole create form model.

### Validation

- Unit: merged parcel geometry produces deterministic map data
- Unit: Page 2 selection chooses the intended primary parcel
- Live smoke: one known multi-APN job reaches Page 5 with the correct map and selected location

## Task 4: New-Permit Submit/Pay Approval Gates

### Problem

New-permit submit/pay currently lacks the same operator checkpoint behavior that renewal submit/pay already has. That is a policy gap on a money-sensitive path.

### Why This Layer

This belongs in the API route that performs submit/pay. The safety boundary should be at the action endpoint, not in assistant behavior or operator memory.

### Minimal File Set

- `apps/dust-permits/src/api/permits.ts`
  Reuse the existing checkpoint pattern from `renew-and-pay` for `submit-draft-and-pay`.
- `tests/apps/dust-permits/unit/`
  Add a focused unit test for checkpoint enforcement on `submit-draft-and-pay`.

### Files Explicitly Not To Change First

- `apps/dust-permits/src/portal/create/flow.ts`
  This is not a Page 5 fill problem.
- `apps/dust-permits/src/index.ts`
  Route registration is not the bug unless the handler contract changes.

### Minimal Change Rule

Reuse the existing operator checkpoint mechanism. Do not invent a second confirmation system.

### Validation

- Unit: submit checkpoint is required before submission
- Unit: pay checkpoint is required before payment confirmation
- Live smoke: route pauses for approval instead of silently proceeding

## Task 5: Create Operation Timeout And Status Reporting

### Problem

Long create runs can succeed in the worker while the caller sees a timeout. That creates false failure signals and duplicate-run pressure.

### Why This Layer

This is not a map or form-fill bug. It is an operation-reporting problem around long-running browser work.

### Minimal File Set

- `apps/dust-permits/src/portal/utils/browser.ts`
  Extend operation state to retain last result or operation status snapshots.
- `apps/dust-permits/src/api/permits.ts`
  Return or expose operation status in a way the caller can poll after timeout-prone creates.
- `apps/dust-permits/src/index.ts`
  Register any narrow status endpoint if one is added.
- `tests/apps/dust-permits/unit/application-create-wait.test.ts`
  Extend or add status/timing assertions around create completion reporting.

### Files Explicitly Not To Change First

- `apps/dust-permits/src/portal/create/fill/*`
  The create flow is already doing the work; reporting is the missing layer.

### Minimal Change Rule

Do not rewrite create execution. Add status reporting around the existing operation wrapper.

### Validation

- Unit: long-running create can be observed through operation status
- Unit: successful completion is queryable after the initial request window
- Live smoke: timed-out caller can still recover the draft ID and final state without rerunning create

## Task 6: Request-Time Date Defaults, Not Process-Start Dates

### Problem

Date defaults are centralized, which is correct. But they are currently embedded in `DEFAULTS` at module load, which makes them process-start values rather than true request-time defaults.

### Why This Layer

If this is changed, it should be changed exactly once in form-data construction. It should not be patched into NOI logic, popup code, or individual create handlers.

### Minimal File Set

- `apps/dust-permits/src/form-data.ts`
  Move dynamic date computation into `buildFormData()` or an equivalent request-time default builder.
- `tests/apps/dust-permits/unit/`
  Add a focused test proving built form data receives fresh request-time dates.

### Files Explicitly Not To Change First

- `apps/dust-permits/src/api/noi.ts`
- `apps/dust-permits/src/api/permits.ts`
- `apps/dust-permits/src/portal/create/flow.ts`

Those layers should consume built form data, not compute date policy.

### Minimal Change Rule

Fix the dynamic default source, not every caller.

### Validation

- Unit: `buildFormData()` computes `startDate = today` and `endDate = today + 1 year` at build time
- Unit: explicit overrides still win
- Live smoke: create without explicit dates produces correct current permit window

## Not In First Pass

These are real topics, but they should not be mixed into the first minimal-fix round:

- broad worker lifecycle redesign
- global title-casing of all manual operator input
- `_meta.skipApplicantSection` cleanup
- larger portal selector refactors outside the specific tasks above
- broader DB/company-matching redesign beyond `portalCompanyId` plumbing

## Validation Baseline For Every Task

Every implementation task above should end with the same minimum verification set:

- targeted unit tests for the changed behavior
- `bunx tsc --noEmit -p apps/dust-permits/tsconfig.json`
- one safe live smoke test through MCP or API
- no duplicate logic added in NOI builder, popup flow, and request handler for the same rule

## Recommended Execution Order

1. Dirty-file audit gate
2. `portalCompanyId` plumbing
3. APN preflight validation
4. submit/pay approval gates
5. request-time date defaults
6. create timeout/status reporting
7. multi-parcel site support

This order keeps the early changes narrow, boundary-focused, and low-risk. Multi-parcel support is intentionally last because it is the only item here that requires a meaningful capability expansion inside the browser-side map flow.

## Task 0 Findings: Task 1 File Set

Date: 2026-03-12

This is the pre-edit diff review for the Task 1 implementation surface.

### `apps/dust-permits/src/api/permits.ts`

- Dirty for unrelated work:
  - `submit-draft-and-pay` route
  - draft-resolution helper
  - softened map-preflight behavior
- Relevant Task 1 observation:
  - active create requests already build `FormData` centrally and call `createApplicationFull`
  - this is the correct boundary for adding optional `portalCompanyId` to create input
- Minimal Task 1 edit:
  - extend create schema/body parsing to accept `portalCompanyId`
  - thread it into `createApplicationFull(...)`
- Do not mix in:
  - submit/pay safety work
  - map preflight policy changes

### `apps/dust-permits/src/api/noi.ts`

- New untracked file from prior NOI work
- Relevant Task 1 observation:
  - preflight already resolves `companyMatch.portalCompanyId`
  - current `createPayload` does not pass `portalCompanyId` through
- Minimal Task 1 edit:
  - add `portalCompanyId` to `createPayload` only when a company match exists
- Do not mix in:
  - more title-casing logic
  - more date logic
  - changes to applicant/president-owner mapping

### `apps/dust-permits/src/portal/types.ts`

- Dirty only for `effectiveFlow` plumbing already added in prior fix work
- Relevant Task 1 observation:
  - `NewAppPopupOptions` is the narrow type seam for carrying exact company identity into popup handling
- Minimal Task 1 edit:
  - add optional `portalCompanyId` to `NewAppPopupOptions`
- Low conflict risk

### `apps/dust-permits/src/portal/create/application.ts`

- Dirty for navigation-race handling and `effectiveFlow` propagation
- Relevant Task 1 observation:
  - `createExistingCompanyApplication(...)` is the correct seam to accept `portalCompanyId` and forward it to popup handling
- Minimal Task 1 edit:
  - extend existing-company create signature with optional `portalCompanyId`
  - pass it into `handleNewAppPopup(...)`
- Do not mix in:
  - more wait/retry behavior
  - more creation timing changes

### `apps/dust-permits/src/portal/create/popup.ts`

- Dirty for normalized name matching and popup `effectiveFlow` return values
- Relevant Task 1 observation:
  - current behavior still selects existing company by normalized row text
  - this is where exact-ID selection should be inserted
- Minimal Task 1 edit:
  - add exact row selection by `portalCompanyId` first
  - preserve current normalized-name matching only as fallback when no ID is provided
- Do not mix in:
  - new fallback flow behavior
  - more normalization heuristics unless needed for fallback preservation

### `apps/dust-permits/src/portal/create/flow.ts`

- Dirty for existing-company fail-fast behavior and Page 1 mode selection by `effectiveFlow`
- Relevant Task 1 observation:
  - Task 1 should not require logic changes here if plumbing is done correctly
- Minimal Task 1 edit:
  - none expected unless type/signature fallout requires a trivial pass-through update
- Treat as:
  - protected file for this task

### `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts`

- Already covers:
  - title casing
  - preflight `existing-company` vs `new-company`
  - `presidentOwner` separation
- Relevant Task 1 observation:
  - mocks already include `portalCompanyId`
  - no assertion currently proves it is passed into `createPayload`
- Minimal Task 1 edit:
  - add assertion for `createPayload.portalCompanyId`

### `tests/apps/dust-permits/unit/popup-company-match.test.ts`

- Already covers:
  - normalized name matching
- Relevant Task 1 observation:
  - no test currently covers exact-ID selection
- Minimal Task 1 edit:
  - add a focused test for exact company-row selection by `portalCompanyId`
  - keep current name-match tests as fallback coverage

### `tests/apps/dust-permits/unit/create-effective-flow.test.ts`

- Already covers:
  - fail-fast when `existing-company` unexpectedly resolves to `new-company`
  - partial Page 1 behavior when existing-company remains existing-company
- Relevant Task 1 observation:
  - no new behavior should be added here unless signature changes ripple into mocks
- Minimal Task 1 edit:
  - prefer no behavioral changes

### Task 1 Scope Decision After Audit

Task 1 remains valid and should proceed next.

The real minimal edit set is:

- `apps/dust-permits/src/api/permits.ts`
- `apps/dust-permits/src/api/noi.ts`
- `apps/dust-permits/src/portal/types.ts`
- `apps/dust-permits/src/portal/create/application.ts`
- `apps/dust-permits/src/portal/create/popup.ts`
- `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts`
- `tests/apps/dust-permits/unit/popup-company-match.test.ts`

`apps/dust-permits/src/portal/create/flow.ts` should be treated as read-only for Task 1 unless a trivial type pass-through is unavoidable.
