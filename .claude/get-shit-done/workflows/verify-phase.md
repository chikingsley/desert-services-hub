<purpose>
Verify phase goal achievement through goal-backward analysis. Check that the codebase actually delivers what the phase promised, not just that tasks were completed.

This workflow is executed by a verification subagent spawned from execute-phase.md.
</purpose>

<core_principle>
**Task completion ≠ Goal achievement**

A task "create chat component" can be marked complete when the component is a placeholder. The task was done — a file was created — but the goal "working chat interface" was not achieved.

Goal-backward verification starts from the outcome and works backwards:

1. What must be TRUE for the goal to be achieved?
2. What must EXIST for those truths to hold?
3. What must be WIRED for those artifacts to function?

Then verify each level against the actual codebase.
</core_principle>

<required_reading>
@./.claude/get-shit-done/references/verification-patterns.md
@./.claude/get-shit-done/templates/verification-report.md
</required_reading>

<process>

<step name="load_context" priority="first">
**Gather all verification context:**

```bash
# Phase directory (match both zero-padded and unpadded)
PADDED_PHASE=$(printf "%02d" ${PHASE_ARG} 2>/dev/null || echo "${PHASE_ARG}")
PHASE_DIR=$(ls -d .planning/phases/${PADDED_PHASE}-* .planning/phases/${PHASE_ARG}-* 2>/dev/null | head -1)

# Phase goal from ROADMAP
grep -A 5 "Phase ${PHASE_NUM}" .planning/ROADMAP.md

# Requirements mapped to this phase
grep -E "^| ${PHASE_NUM}" .planning/REQUIREMENTS.md 2>/dev/null

# All SUMMARY files (claims to verify)
ls "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null

# All PLAN files (for must_haves in frontmatter)
ls "$PHASE_DIR"/*-PLAN.md 2>/dev/null
```csv
```bash
grep -l "must_haves:" "$PHASE_DIR"/*-PLAN.md 2>/dev/null
```text
```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
  artifacts:
    - path: "src/components/Chat.tsx"
      provides: "Message list rendering"
  key_links:
    - from: "Chat.tsx"
      to: "api/chat"
      via: "fetch in useEffect"
```markdown
```bash
check_exists() {
  local path="$1"
  if [ -f "$path" ]; then
    echo "EXISTS"
  elif [ -d "$path" ]; then
    echo "EXISTS (directory)"
  else
    echo "MISSING"
  fi
}
```csv
```bash
check_length() {
  local path="$1"
  local min_lines="$2"
  local lines=$(wc -l < "$path" 2>/dev/null || echo 0)
  [ "$lines" -ge "$min_lines" ] && echo "SUBSTANTIVE ($lines lines)" || echo "THIN ($lines lines)"
}
```markdown
```bash
check_stubs() {
  local path="$1"

  # Universal stub patterns
  local stubs=$(grep -c -E "TODO|FIXME|placeholder|not implemented|coming soon" "$path" 2>/dev/null || echo 0)

  # Empty returns
  local empty=$(grep -c -E "return null|return undefined|return \{\}|return \[\]" "$path" 2>/dev/null || echo 0)

  # Placeholder content
  local placeholder=$(grep -c -E "will be here|placeholder|lorem ipsum" "$path" 2>/dev/null || echo 0)

  local total=$((stubs + empty + placeholder))
  [ "$total" -gt 0 ] && echo "STUB_PATTERNS ($total found)" || echo "NO_STUBS"
}
```text
```bash
check_exports() {
  local path="$1"
  grep -E "^export (default )?(function|const|class)" "$path" && echo "HAS_EXPORTS" || echo "NO_EXPORTS"
}
```css
```bash
check_imported() {
  local artifact_name="$1"
  local search_path="${2:-src/}"

  # Find imports of this artifact
  local imports=$(grep -r "import.*$artifact_name" "$search_path" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)

  [ "$imports" -gt 0 ] && echo "IMPORTED ($imports times)" || echo "NOT_IMPORTED"
}
```text
```bash
check_used() {
  local artifact_name="$1"
  local search_path="${2:-src/}"

  # Find usages (function calls, component renders, etc.)
  local uses=$(grep -r "$artifact_name" "$search_path" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "import" | wc -l)

  [ "$uses" -gt 0 ] && echo "USED ($uses times)" || echo "NOT_USED"
}
```css
```bash
verify_component_api_link() {
  local component="$1"
  local api_path="$2"

  # Check for fetch/axios call to the API
  local has_call=$(grep -E "fetch\(['\"].*$api_path|axios\.(get|post).*$api_path" "$component" 2>/dev/null)

  if [ -n "$has_call" ]; then
    # Check if response is used
    local uses_response=$(grep -A 5 "fetch\|axios" "$component" | grep -E "await|\.then|setData|setState" 2>/dev/null)

    if [ -n "$uses_response" ]; then
      echo "WIRED: $component → $api_path (call + response handling)"
    else
      echo "PARTIAL: $component → $api_path (call exists but response not used)"
    fi
  else
    echo "NOT_WIRED: $component → $api_path (no call found)"
  fi
}
```css
```bash
verify_api_db_link() {
  local route="$1"
  local model="$2"

  # Check for Prisma/DB call
  local has_query=$(grep -E "prisma\.$model|db\.$model|$model\.(find|create|update|delete)" "$route" 2>/dev/null)

  if [ -n "$has_query" ]; then
    # Check if result is returned
    local returns_result=$(grep -E "return.*json.*\w+|res\.json\(\w+" "$route" 2>/dev/null)

    if [ -n "$returns_result" ]; then
      echo "WIRED: $route → database ($model)"
    else
      echo "PARTIAL: $route → database (query exists but result not returned)"
    fi
  else
    echo "NOT_WIRED: $route → database (no query for $model)"
  fi
}
```css
```bash
verify_form_handler_link() {
  local component="$1"

  # Find onSubmit handler
  local has_handler=$(grep -E "onSubmit=\{|handleSubmit" "$component" 2>/dev/null)

  if [ -n "$has_handler" ]; then
    # Check if handler has real implementation
    local handler_content=$(grep -A 10 "onSubmit.*=" "$component" | grep -E "fetch|axios|mutate|dispatch" 2>/dev/null)

    if [ -n "$handler_content" ]; then
      echo "WIRED: form → handler (has API call)"
    else
      # Check for stub patterns
      local is_stub=$(grep -A 5 "onSubmit" "$component" | grep -E "console\.log|preventDefault\(\)$|\{\}" 2>/dev/null)
      if [ -n "$is_stub" ]; then
        echo "STUB: form → handler (only logs or empty)"
      else
        echo "PARTIAL: form → handler (exists but unclear implementation)"
      fi
    fi
  else
    echo "NOT_WIRED: form → handler (no onSubmit found)"
  fi
}
```css
```bash
verify_state_render_link() {
  local component="$1"
  local state_var="$2"

  # Check if state variable exists
  local has_state=$(grep -E "useState.*$state_var|\[$state_var," "$component" 2>/dev/null)

  if [ -n "$has_state" ]; then
    # Check if state is used in JSX
    local renders_state=$(grep -E "\{.*$state_var.*\}|\{$state_var\." "$component" 2>/dev/null)

    if [ -n "$renders_state" ]; then
      echo "WIRED: state → render ($state_var displayed)"
    else
      echo "NOT_WIRED: state → render ($state_var exists but not displayed)"
    fi
  else
    echo "N/A: state → render (no state var $state_var)"
  fi
}
```typescript
```bash
# Find requirements mapped to this phase
grep -E "Phase ${PHASE_NUM}" .planning/REQUIREMENTS.md 2>/dev/null
```text
```bash
# Extract files from SUMMARY.md
grep -E "^\- \`" "$PHASE_DIR"/*-SUMMARY.md | sed 's/.*`\([^`]*\)`.*/\1/' | sort -u
```text
```bash
scan_antipatterns() {
  local files="$@"

  echo "## Anti-Patterns Found"
  echo ""

  for file in $files; do
    [ -f "$file" ] || continue

    # TODO/FIXME comments
    grep -n -E "TODO|FIXME|XXX|HACK" "$file" 2>/dev/null | while read line; do
      echo "| $file | $(echo $line | cut -d: -f1) | TODO/FIXME | ⚠️ Warning |"
    done

    # Placeholder content
    grep -n -E "placeholder|coming soon|will be here" "$file" -i 2>/dev/null | while read line; do
      echo "| $file | $(echo $line | cut -d: -f1) | Placeholder | 🛑 Blocker |"
    done

    # Empty implementations
    grep -n -E "return null|return \{\}|return \[\]|=> \{\}" "$file" 2>/dev/null | while read line; do
      echo "| $file | $(echo $line | cut -d: -f1) | Empty return | ⚠️ Warning |"
    done

    # Console.log only implementations
    grep -n -B 2 -A 2 "console\.log" "$file" 2>/dev/null | grep -E "^\s*(const|function|=>)" | while read line; do
      echo "| $file | - | Log-only function | ⚠️ Warning |"
    done
  done
}
```csv
```markdown
## Human Verification Required

### 1. {Test Name}
**Test:** {What to do}
**Expected:** {What should happen}
**Why human:** {Why can't verify programmatically}
```html
```

score = (verified_truths / total_truths)

```html
```markdown
### {phase}-{next}-PLAN.md: {Fix Name}

**Objective:** {What this fixes}

**Tasks:**
1. {Task to fix gap 1}
   - Files: {files to modify}
   - Action: {specific fix}
   - Verify: {how to confirm fix}

2. {Task to fix gap 2}
   - Files: {files to modify}
   - Action: {specific fix}
   - Verify: {how to confirm fix}

3. Re-verify phase goal
   - Run verification again
   - Confirm all must-haves pass

**Estimated scope:** {Small / Medium}
```markdown
```bash
REPORT_PATH="$PHASE_DIR/${PHASE_NUM}-VERIFICATION.md"
```csv
```markdown
## Verification Complete

**Status:** {passed | gaps_found | human_needed}
**Score:** {N}/{M} must-haves verified
**Report:** .planning/phases/{phase_dir}/{phase}-VERIFICATION.md

{If passed:}
All must-haves verified. Phase goal achieved. Ready to proceed.

{If gaps_found:}
### Gaps Found

{N} critical gaps blocking goal achievement:
1. {Gap 1 summary}
2. {Gap 2 summary}

### Recommended Fixes

{N} fix plans recommended:
1. {phase}-{next}-PLAN.md: {name}
2. {phase}-{next+1}-PLAN.md: {name}

{If human_needed:}
### Human Verification Required

{N} items need human testing:
1. {Item 1}
2. {Item 2}

Automated checks passed. Awaiting human verification.
```

The orchestrator will:

- If `passed`: Continue to update_roadmap
- If `gaps_found`: Create and execute fix plans, then re-verify
- If `human_needed`: Present items to user, collect responses
</step>

</process>

<success_criteria>

- [ ] Must-haves established (from frontmatter or derived)
- [ ] All truths verified with status and evidence
- [ ] All artifacts checked at all three levels
- [ ] All key links verified
- [ ] Requirements coverage assessed (if applicable)
- [ ] Anti-patterns scanned and categorized
- [ ] Human verification items identified
- [ ] Overall status determined
- [ ] Fix plans generated (if gaps_found)
- [ ] VERIFICATION.md created with complete report
- [ ] Results returned to orchestrator
</success_criteria>
