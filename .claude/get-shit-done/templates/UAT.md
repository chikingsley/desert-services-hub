# UAT Template

Template for `.planning/phases/XX-name/{phase}-UAT.md` — persistent UAT session tracking.

---

## File Template

```markdown
---
status: testing | complete | diagnosed
phase: XX-name
source: [list of SUMMARY.md files tested]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: [N]
name: [test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior - what user should see]
result: [pending]

### 2. [Test Name]
expected: [observable behavior]
result: pass

### 3. [Test Name]
expected: [observable behavior]
result: issue
reported: "[verbatim user response]"
severity: major

### 4. [Test Name]
expected: [observable behavior]
result: skipped
reason: [why skipped]

...

## Summary

total: [N]
passed: [N]
issues: [N]
pending: [N]
skipped: [N]

## Gaps

<!-- YAML format for plan-phase --gaps consumption -->
- truth: "[expected behavior from test]"
  status: failed
  reason: "User reported: [verbatim response]"
  severity: blocker | major | minor | cosmetic
  test: [N]
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis
```html
```yaml
## Gaps

- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
  debug_session: ".planning/debug/comment-not-refreshing.md"
```html
```markdown
---
status: diagnosed
phase: 04-comments
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md
started: 2025-01-15T10:30:00Z
updated: 2025-01-15T10:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. View Comments on Post
expected: Comments section expands, shows count and comment list
result: pass

### 2. Create Top-Level Comment
expected: Submit comment via rich text editor, appears in list with author info
result: issue
reported: "works but doesn't show until I refresh the page"
severity: major

### 3. Reply to a Comment
expected: Click Reply, inline composer appears, submit shows nested reply
result: pass

### 4. Visual Nesting
expected: 3+ level thread shows indentation, left borders, caps at reasonable depth
result: pass

### 5. Delete Own Comment
expected: Click delete on own comment, removed or shows [deleted] if has replies
result: pass

### 6. Comment Count
expected: Post shows accurate count, increments when adding comment
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Comment appears immediately after submission in list"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
  debug_session: ".planning/debug/comment-not-refreshing.md"
```

</good_example>
