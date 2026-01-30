<purpose>Surface Claude's assumptions about a phase before planning, enabling users to correct misconceptions early.Key difference from discuss-phase: This is ANALYSIS of what Claude thinks, not INTAKE of what user knows. No file output - purely conversational to prompt discussion.</purpose><process><step name="validate_phase" priority="first">Phase number: $ARGUMENTS (required)**If argument missing:**```yaml```text
```bashcat .planning/ROADMAP.md | grep -i "Phase ${PHASE}"```text```text
```markdown```bash
```html```markdown
```text```text
```html```text
```Wait for user selection.If "Discuss context": Note that CONTEXT.md will incorporate any corrections discussed hereIf "Plan this phase": Proceed knowing assumptions are understoodIf "Re-examine": Return to analyze_phase with updated understanding</step></process><success_criteria>- Phase number validated against roadmap- Assumptions surfaced across five areas: technical approach, implementation order, scope, risks, dependencies- Confidence levels marked where appropriate- "What do you think?" prompt presented- User feedback acknowledged- Clear next steps offered</success_criteria>