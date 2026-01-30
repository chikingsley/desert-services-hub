---
name: gsd:check-todos
description: List pending todos and select one to work on
argument-hint: [area filter]
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
---

<objective>
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.

Enables reviewing captured ideas and deciding what to work on next.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>

<step name="check_exist">
```bash
TODO_COUNT=$(ls .planning/todos/pending/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Pending todos: $TODO_COUNT"
```text
```
No pending todos.

Todos are captured during work sessions with /gsd:add-todo.

---

Would you like to:

1. Continue with current phase (/gsd:progress)
2. Add a todo now (/gsd:add-todo)

```html
```bash
for file in .planning/todos/pending/*.md; do
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file"
done | sort
```text
```

Pending Todos:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
3. Refactor database connection pool (database, 5h ago)

---

Reply with a number to view details, or:

- `/gsd:check-todos [area]` to filter by area
- `q` to exit

```html
```

## [title]

**Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]

### Problem

[problem section content]

### Solution

[solution section content]

```html
```bash
ls .planning/ROADMAP.md 2>/dev/null && echo "Roadmap exists"
```text
```bash
mv ".planning/todos/pending/[filename]" ".planning/todos/done/"
```sql
```bash
ls .planning/todos/pending/*.md 2>/dev/null | wc -l
```sql
```bash
COMMIT_PLANNING_DOCS=$(cat .planning/config.json 2>/dev/null | grep -o '"commit_docs"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "true")
git check-ignore -q .planning 2>/dev/null && COMMIT_PLANNING_DOCS=false
```text
```bash
git add .planning/todos/done/[filename]
git rm --cached .planning/todos/pending/[filename] 2>/dev/null || true
[ -f .planning/STATE.md ] && git add .planning/STATE.md
git commit -m "$(cat <<'EOF'
docs: start work on todo - [title]

Moved to done/, beginning implementation.
EOF
)"
```

Confirm: "Committed: docs: start work on todo - [title]"
</step>

</process>

<output>
- Moved todo to `.planning/todos/done/` (if "Work on it now")
- Updated `.planning/STATE.md` (if todo count changed)
</output>

<anti_patterns>

- Don't delete todos — move to done/ when work begins
- Don't start work without moving to done/ first
- Don't create plans from this command — route to /gsd:plan-phase or /gsd:add-phase
</anti_patterns>

<success_criteria>

- [ ] All pending todos listed with title, area, age
- [ ] Area filter applied if specified
- [ ] Selected todo's full context loaded
- [ ] Roadmap context checked for phase match
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] STATE.md updated if todo count changed
- [ ] Changes committed to git (if todo moved to done/)
</success_criteria>
