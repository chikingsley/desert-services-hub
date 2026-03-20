# Dust Permits Refactor TODO

This is a read-only assessment turned into a working note.

The goal is not to "rewrite the whole thing." The goal is to reduce accidental
complexity while preserving the domain logic that is actually earning its keep.

## Bottom Line

Yes, this app is refactorable.

The parts worth preserving are:

- The centralized `FormData` domain model.
- The `buildFormData()` / `reconcilePostK()` idea.
- The split between page-level and category-level Playwright fillers.

The parts creating most of the accidental complexity are:

- Partial-update handling on Page 4.
- Validation that is mostly type-level instead of operation-level.
- Duplicated flow engines across create/renew/revise/resume.
- One oversized module doing too many jobs (`src/form-data.ts`).
- Missing active browser-flow regression coverage.

## Evidence Summary

### 1. Page 4 partial updates are not actually safe today

Expected contract:

- `fillPage4()` says revisions can provide only the categories being modified.

Evidence:

- `src/portal/create/fill/page4.ts`
  - `hasCategoryB/hasCategoryC/hasCategoryD/hasCategoryF/hasCategoryG/hasCategoryI`
    only check whether any subsection exists.
  - The implementation then casts the payload to `FormData` and calls the whole
    grouped filler.
- `src/portal/create/fill/page4/category-b.ts`
  - `fillCategoryB()` always calls `fillCategoryB1()` and `fillCategoryB2()`.
- `src/portal/create/fill/page4/category-c.ts`
  - `fillCategoryC()` always calls `fillCategoryC1()` through `fillCategoryC4()`.
- `src/portal/create/fill/page4/category-d.ts`
  - `fillCategoryD()` always calls `fillCategoryD1()` through `fillCategoryD5()`.
- `src/portal/create/fill/page4/category-f.ts`
  - `fillCategoryF()` always calls `fillCategoryF1()` and `fillCategoryF2()`.
- `src/portal/create/fill/page4/category-i.ts`
  - `fillCategoryI()` always calls `fillCategoryI1()`, and then conditionally `I2`.

Why this matters:

- A partial payload containing only `categoryC4` can still execute `C1`, `C2`,
  and `C3`.
- A partial payload containing only `categoryB2` can still execute `B1`.
- That means the current "partial category update" contract is brittle and can
  fail with missing sibling data.

What this refactor would solve:

- Makes revisions/resume/custom overrides truly partial-aware.
- Removes the need for unsafe `as FormData` casts in Page 4 orchestration.
- Makes Page 4 behavior easier to reason about because each subsection becomes
  independent.

Complexity / code-size expectation:

- Short term: slightly more code or roughly flat, because grouped dispatch will
  become more explicit.
- Medium term: simpler logic and fewer cross-subsection assumptions.
- Risk reduction is high even if net LOC change is small.

Recommendation:

- Refactor Page 4 so each subsection is dispatched independently.
- Make grouped files tolerate missing sibling sections instead of assuming full
  `FormData`.

### 2. Create validation is weaker than the workflow requires

Evidence:

- `src/api/permits.ts`
  - `apiCreateSchema` makes `companyName`, `copyFromApp`, and `formData`
    optional.
  - `handleCreatePermit()` builds from defaults even when very little input is
    provided.
- `src/lib/form-data-validation.ts`
  - Validation is generated from the defaults template.
  - Generic strings are validated with `z.string()`, not non-empty or
    flow-specific rules.
- `src/form-data.ts`
  - `DEFAULTS` contains many empty strings that pass the current built-form
    validation.

Why this matters:

- A request can be "valid" to the API and still be operationally invalid in the
  portal.
- Failure gets pushed later into Playwright, which is the most expensive and
  hardest place to discover bad input.

What this refactor would solve:

- Moves failure earlier, with clearer error messages.
- Makes the API contract match the actual workflow contract.
- Reduces debugging time because "bad input" stops looking like "portal flake."

Complexity / code-size expectation:

- Short term: slightly more code, because flow-specific schemas and rules need
  to exist explicitly.
- Medium term: simpler behavior overall, because fewer invalid jobs reach the
  browser.
- Worth it. This is one of the highest leverage refactors.

Recommendation:

- Add flow-aware validation:
  - `new-company`: require the specific applicant/contact/project fields needed
    to operate.
  - `existing-company`: require `companyName` plus the specific fields needed.
  - `renew`: require `companyName`, `copyFromApp`, and any allowed overrides.
- Keep type validation, but add operational validation on top of it.

### 3. Flow logic is duplicated and already drifting

Evidence:

- `src/portal/create/flow.ts`
  - Contains create, renew, revise, and renew-pay orchestration.
- `src/portal/resume.ts`
  - Reimplements page navigation.
  - Reimplements a Page 3 filler separate from the main one.
- `src/portal/create/navigation.ts`
  - Has a separate page-navigation implementation.
- `src/portal/create/fill/page3.ts`
  - Has the main Page 3 implementation, which does more than resume's version.

Why this matters:

- Selector changes, fallback improvements, or behavior fixes can land in one
  flow and not the others.
- Reviewing behavior becomes harder because there is not one canonical flow
  engine.
- Resume/create/renew/revise are conceptually variants of the same multi-step
  process, but the code treats them as partly separate systems.

What this refactor would solve:

- One shared step runner with per-flow strategy differences.
- One canonical navigation implementation.
- One canonical Page 3/Page 4 policy.

Complexity / code-size expectation:

- Short term: may stay flat or go slightly up while extracting shared pieces.
- Medium term: likely net code down because duplicate orchestration should
  disappear.
- This is the clearest path to making the codebase feel less "branchy."

Recommendation:

- Introduce a shared workflow runner with step hooks:
  - create application
  - page 1 policy
  - page 2 policy
  - page 3 policy
  - page 4 policy
  - page 5 policy
- Let create/renew/revise/resume supply strategy differences instead of owning
  whole duplicated flows.

### 4. `src/form-data.ts` is doing too many jobs

Evidence:

- `src/form-data.ts`
  - Type definitions.
  - defaults
  - payment env loading
  - selector typing
  - deep merge
  - Post-K reconciliation
  - page-state types
- `src/lib/form-data-validation.ts`
  - Builds schemas from the defaults object.
- `src/api/form-schema.ts`
  - Exposes defaults/schema for external consumers.

Why this matters:

- A shape change in one place has ripple effects across defaults, validation,
  schema generation, API behavior, and callers.
- The file has become a dependency magnet.
- This is probably the biggest reason the whole setup feels harder than it
  should.

What this refactor would solve:

- Clearer ownership:
  - types
  - runtime defaults
  - validation
  - reconciliation
  - external schema/default exports
- Smaller modules with narrower reasons to change.

Complexity / code-size expectation:

- Short term: similar total LOC, just redistributed.
- Medium term: lower cognitive load even if total LOC barely moves.
- This is more about comprehension than raw line count.

Recommendation:

- Split into modules such as:
  - `src/form-data/types.ts`
  - `src/form-data/defaults.ts`
  - `src/form-data/reconcile.ts`
  - `src/form-data/build.ts`
  - `src/form-data/schema.ts`
  - `src/form-data/payment.ts` or similar for env-backed payment config

### 5. The testing surface is too thin for a safe refactor

Evidence:

- Existing tests are only:
  - `tests/api/maricopa.test.ts`
  - `tests/api/noi-triage.test.ts`
  - `tests/api/pima.test.ts`
- `package.json` advertises:
  - `bun test`
  - `bun test tests/api/`
  - `bun test --max-concurrency 1 tests/e2e/`
- At the time of review:
  - `bun test tests/api/` passed.
  - `bun test --max-concurrency 1 tests/e2e/` returned no matching test files.

Why this matters:

- The most complex code paths are the least protected.
- Refactoring flow orchestration or Page 4 without tests means regression
  detection will rely on manual portal runs.

What this refactor would solve:

- Makes future simplification work much safer.
- Gives confidence to remove duplicated flow code.
- Lets you change shape without needing full live-portal confidence every time.

Complexity / code-size expectation:

- Yes, adds code.
- But it is good code: it buys freedom to simplify the production code.
- Expect net LOC up first, then net LOC down after the real refactors.

Recommendation:

- Add tests before major refactors in these areas:
  - `buildFormData()` / `reconcilePostK()`
  - flow-specific validation rules
  - Page 4 partial subsection dispatch
  - high-level create/renew/revise/resume orchestration

## Refactor Sequence I Would Use

### Phase 1: Guardrails

Goal:

- Make refactoring safe.

Tasks:

- Add unit tests for Post-K reconciliation.
- Add tests for flow-aware input validation.
- Add tests proving Page 4 partial updates work by subsection.
- Add at least a small integration harness around orchestration.

Expected result:

- More code at first.
- Lower risk immediately.

### Phase 2: Fix the real bug first

Goal:

- Make Page 4 partial updates actually true.

Tasks:

- Remove grouped "any subsection means run all subsections" behavior.
- Make each subsection independently fillable.
- Remove unnecessary `as FormData` casts.

Expected result:

- Slight code increase or flat.
- Meaningfully simpler behavior.

### Phase 3: Tighten the API contract

Goal:

- Stop invalid jobs before the browser starts.

Tasks:

- Add flow-specific create schemas.
- Add operational validation beyond type shape.
- Return earlier, clearer API errors.

Expected result:

- Slight code increase.
- Noticeably simpler runtime behavior.

### Phase 4: Unify the flows

Goal:

- Replace duplicated orchestration with one shared engine.

Tasks:

- Extract shared navigation and step execution.
- Make create/renew/revise/resume strategy-driven variants.
- Reuse the same Page 3 and Page 4 policy everywhere.

Expected result:

- Likely net code reduction after extraction.
- Much lower maintenance burden.

### Phase 5: Split the form-data monolith

Goal:

- Reduce cognitive load and narrow module ownership.

Tasks:

- Break `src/form-data.ts` into focused modules.
- Stop using one file as the dumping ground for every form-related concern.

Expected result:

- LOC may stay similar.
- Comprehension should improve a lot.

## What I Would Not Do

- I would not rewrite all Playwright code at once.
- I would not delete `buildFormData()` / `reconcilePostK()` unless there is a
  better single place for that logic.
- I would not try to generalize every portal interaction into a super-abstract
  framework. This portal is brittle enough that some explicitness is good.

## Rough Payoff Ranking

Highest payoff:

1. Page 4 partial-update refactor
2. Flow-aware validation
3. Shared orchestration runner

Good but less urgent:

4. Split `form-data.ts`
5. Documentation cleanup

## Current Recommendation

If this work starts, start here:

1. Add tests around Page 4 partial updates and Post-K reconciliation.
2. Refactor Page 4 dispatch so partial updates are real.
3. Add flow-aware create validation.
4. Then unify create/renew/revise/resume.

That order gives the best ratio of safety to simplification.
