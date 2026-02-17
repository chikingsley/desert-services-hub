# NOI/NDC Intake Funnel Roadmap (Desert Services)

## Objective

Build a revenue-focused content + intake system that converts Arizona stormwater permit confusion into qualified leads for NOI filing, SWPPP support, and recurring compliance services.

## Positioning

- Core pain: Permit language is dense, inconsistent, and hard to operationalize.
- Core promise: "Tell us your project facts, and we tell you exactly what permit path applies and what to do next."
- Trust layer: Every claim maps to a source document and review date.

## Guide Product Stack (Keep Both)

- **Simple Guide (Client Fast Path):** 1 page, plain language, "click here -> choose this -> submit this."
- **Standard Guide (Current v2):** Decision logic + checklist + risk notes.
- **Deep Reference (Internal):** Full source-backed details for edge cases and team QA.

Rule: do not replace the current v2 guide; publish the Simple Guide as an additional format.

## Funnel Architecture

1. **Intent Capture Pages**
- "Do I need an NOI in Arizona?"
- "NOI vs NDC: Which one applies?"
- "How to file in myDEQ without rework"

2. **Lead Magnet / Utility Tool**
- Interactive "Permit Path Checker" (NOI vs NDC)
- Output: one-page custom checklist + required data list
- CTA: "Have Desert Services review before you file"

3. **Service CTAs**
- Fast intake form with project facts (acreage, municipality, discharge path, timeline)
- Route to services: NOI filing support, SWPPP package, annual compliance support

4. **Nurture + Conversion**
- Email sequence:
  - Email 1: Permit path summary
  - Email 2: Common rejection/rework issues
  - Email 3: Done-for-you filing offer + scheduling link

## Content System (Authority Stack)

- **Tier 1 (Official):** ADEQ permit text, fact sheets, FAQs, A.R.S.
- **Tier 2 (Operational):** Desert Services playbooks/checklists
- **Tier 3 (Local nuance):** Municipality handouts flagged as legacy unless verified

Rule: Every public page needs a "last reviewed" date and source references.

## Commercial Offers

- **Starter:** Permit path review + filing checklist
- **Core:** NOI/NDC filing package
- **Pro:** NOI + SWPPP + ongoing compliance tracking (NOT, annual obligations)

## KPI Targets

- Qualified form submissions/week
- Cost per qualified lead (ads)
- Lead-to-consult conversion rate
- Consult-to-closed rate
- Average revenue per permit-related engagement

## First 30-Day Execution Plan

1. Publish one canonical page: NOI vs NDC decision guide (SEO + paid landing variant).
2. Publish the one-page Simple Guide PDF for clients who just need step-by-step filing actions.
3. Ship Permit Path Checker MVP (form logic + downloadable checklist PDF).
4. Add CRM capture and lead scoring fields.
5. Launch two ad groups:
- "Do I need an NOI Arizona"
- "myDEQ NOI help"
6. Track conversion end-to-end and refine based on search queries + form drop-offs.

## Immediate Build Outputs

1. Keep the branded PDF quickstart guide as the standard guide (v2 generator in `packages/documents/pdf-generation/src/stormwater/noi-ndc-quickstart.ts`).
2. Create a second "Simple Guide" output template modeled after the original one-page instruction style.
3. Create website version of the same content (single-source content blocks).
4. Add intake form schema for NOI/NDC triage so ops can process leads consistently.
