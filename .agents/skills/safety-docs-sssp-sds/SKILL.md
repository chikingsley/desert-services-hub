---
name: safety-docs-sssp-sds
description: Build and revise Desert Services safety documents (SSSP + SDS packet), including contact assignment from sales-territory mapping, phone-format normalization, PDF generation, and delivery/open on work-mac.
---

# Safety Docs (SSSP + SDS)

Use this skill for requests like:
- "make/update the site safety plan"
- "update contacts/phones in SSSP"
- "send/open SSSP/SDS on my work computer"
- "who is assigned to this GC and put them on the plan"

## Workflow

1. Resolve project packet folder and input JSON
- Prefer existing triage packet path (example): `data/triage/1400-w-3rd/`
- SSSP input file: `data/triage/<slug>/sssp-input.json`

2. Resolve assigned SSM (project lead default)
- Check latest sales-territory email attachment/workbook first.
- If user gave explicit person override, use user value.

3. Resolve contact phones/emails
- Pull email + phone from latest reliable internal source (contacts table or email signature).
- Keep phone format consistent:
  - `C: (###) ###-####`
  - `O: (###) ###-####`

4. Update SSSP input JSON
- Set project-lead row to assigned SSM (unless overridden).
- Ensure field/dispatcher/office rows follow the same phone style.

5. Generate PDF
- Command:
```bash
bun packages/documents/pdf-generation-cli/bin/cli.ts safety sssp generate --in <input.json> --out <output.pdf>
```
- Use revisioned output while iterating (`..._rNN.pdf`).

6. Final naming + work-mac delivery
- Final client-facing filename should be clean, not `rNN`.
- Copy to project folder on work Mac (example): `~/Downloads/1400w3rd/`
- Open in Preview via AppleScript:
```bash
ssh work-mac 'osascript -e "tell application \"Preview\" to open POSIX file \"/Users/chiejimofor/Downloads/1400w3rd/<file>.pdf\""'
```
- Move draft revisions into `~/Downloads/1400w3rd/archive/`.

## Notes

- Avoid editing PDFs manually; always edit source JSON + generator code.
- If phone lines wrap badly in table output, fix generator layout (column widths / noWrap) instead of hand-editing text.
- Keep final deliverables in the project folder with related docs (subcontract, SDS packet, etc.).
