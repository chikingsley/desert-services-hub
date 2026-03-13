# Dust Permit Automation Guardrails

Date: 2026-03-11

## What Failed

- NOI/create preflight defaulted to `existing-company` even when no known company match existed.
- The popup create flow could silently fall back from `existing-company` to `new-company`.
- NOI payload generation copied the SWPPP/project contact into `presidentOwner`.
- NOI-derived strings were passed through in inconsistent casing.
- NOI payload generation copied NOI construction dates into the permit payload, overriding the permit application's own date window.
- A direct submit/pay route was used without a separate explicit submit/pay instruction.

## Guardrails

- Resolve company flow before browser automation starts.
  - If the company is matched in preflight, use `existing-company`.
  - If the company is not matched in preflight, use `new-company`.
- Do not silently change company flow inside the popup.
  - If preflight selected `existing-company` and the popup cannot honor that, fail fast.
- Never map the SWPPP/project contact into `presidentOwner`.
  - `presidentOwner` is only for actual applicant officer/owner data.
  - If NOI data does not contain valid officer contact details, require overrides instead of inventing them.
- Title-case NOI-derived human-readable fields before they are pushed into the permit flow.
  - Company names
  - Project/site names
  - Person names
  - Street addresses
  - Cities
- Never source permit project dates from NOI construction dates.
  - For new permit creation, use the application date as `startDate`.
  - Use `startDate + 1 year` as `endDate`.
  - Do not override those dates from NOI data unless the user explicitly provides a different permit window.
- Treat `submit/pay` as a separate authorization boundary.
  - `expedited` is not authorization to submit.
  - `submit/pay` requires an explicit user instruction for submission/payment.
- If a file path begins with `/Users/chiejimofor/`, assume it is on `work-mac` and pull it over SSH before using it locally.

## Code Changes Backing These Guardrails

- NOI preflight now infers `new-company` vs `existing-company` before browser execution.
- Existing-company popup selection now normalizes punctuation/case when matching company names.
- Existing-company create runs now fail fast instead of silently continuing as `new-company`.
- NOI payload generation now keeps `primaryContact` and `presidentOwner` separate.
- NOI payload generation now title-cases derived display fields.
- NOI payload generation no longer injects construction start/end dates into new permit payloads.

## Regression Coverage

- `tests/apps/dust-permits/unit/noi-resolve-payload.test.ts`
- `tests/apps/dust-permits/unit/popup-company-match.test.ts`
- `tests/apps/dust-permits/unit/create-effective-flow.test.ts`
