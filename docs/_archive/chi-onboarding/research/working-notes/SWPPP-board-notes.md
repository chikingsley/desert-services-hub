# SWPPP Board Structure Notes

## Current Understanding

- Each SWPPP project carries a bundle of operational tasks; many (e.g., dust permit filing, sandbag prep, SWPPP narrative, signage) move on different cadences even within the same week
- A "Today" swimlane or view would surface any card with an imminent due date without removing it from its project group, so work remains contextualised under the project
- Dust permits roll up under one item with subitems capturing filing date, receipt confirmation, and downstream delivery/install tasks; subtype (*New*, *Renewal*, *Closeout*) still affects lead time and billing
- Sandbags act as weights for fence stands; deployment should be its own subitem with quantity fields capturing pallets used per project, and we still need onsite confirmation on how their tracking ties into the daily schedule
- Narrative creation and book assembly/delivery are modeled as separate items; creation follows `ds-process-workflow/2-deliverables/workflow-maps/SWPPP_Docs_Process.mermaid`, while delivery aligns with inspector handoff
- Signage involves at least two stages—ordering (often via Karen/Jayson) and installation in the field; sticker replacements (e.g., AZCON swap) should be their own items so they track separately from standard sign kits

## Tentative Board Elements

- **Project Grouping**: One group per active project with tasks as individual items so partially complete installs can be updated separately.
- **Task Columns**: standardized dropdowns for work subtype (dust permit filing vs. delivery, narrative vs. book, signage vs. sticker), ownership, due dates, crew assignment, and a numeric field to log pallets or other quantity-based installs.
- **Automations/Views**: "Today" filter showing all items due today; "Permit Ops" view filtered to permit subtasks; "Field Install" view filtered to signage + sandbag items.
- **Handoff to Billing**: Completion status in Monday should trigger an automation that sends the item (with quantities, permit subtype, delivery confirmation) to a billing board so Kendra has what she needs for QuickBooks/SOV work (`ds-process-workflow/2-deliverables/people-summaries/Kendra-Ash-Jayson-Roti-SWPPP-Operations-Summary.md:1931`).

## Open Questions

1. Pallet usage: confirm onsite whether tracking should note pallets staged at yard vs deployed so we can structure columns correctly.
2. Billing handoff: confirm the minimum data accounting needs on the billing board (quantities installed, permit/sticker charges, approvals) beyond the "work complete" cue already used in Excel/QuickBooks (`ds-process-workflow/2-deliverables/people-summaries/Kendra-Ash-Jayson-Roti-SWPPP-Operations-Summary.md:1931`).
3. Customer billing preferences: capture which billing platform/service each customer requires and whether they expect monthly vs single-invoice billing (`solutions.md:13`).
4. Non-install crew tasks: document standard work (permit follow-ups, schedule prep, inventory staging) expected during downtime so Monday can surface those assignments when crews are offsite.
