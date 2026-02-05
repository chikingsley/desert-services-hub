# Tasks System Reference

## Overview

The Tasks system is a **built-in task tracker** for organizing complex work. It's different from the Task tool (which spawns subagents).

Four tools:
- `TaskCreate` - Add new tasks
- `TaskUpdate` - Update status, set dependencies
- `TaskList` - See all tasks
- `TaskGet` - Get full task details

## Task Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-assigned identifier |
| `subject` | string | Brief title in **imperative** form ("Run tests") |
| `description` | string | Detailed requirements |
| `activeForm` | string | Present continuous for spinner ("Running tests") |
| `status` | enum | `pending`, `in_progress`, `completed` |
| `owner` | string | Agent name (for multi-agent scenarios) |
| `blockedBy` | string[] | Task IDs that must complete first |
| `blocks` | string[] | Task IDs this blocks |
| `metadata` | object | Arbitrary key-value pairs |

## Status Workflow

```text
pending → in_progress → completed
```

Use `deleted` to remove a task.

## When to Use Tasks

### YES - Use Tasks

- **3+ step tasks** requiring distinct actions
- **Complex work** requiring planning
- **Plan mode** - track implementation steps
- **User provides list** of things to do
- **Multiple phases** with dependencies

### NO - Skip Tasks

- Single straightforward task
- Trivial work (< 3 steps)
- Purely conversational questions

## Basic Usage

```javascript
// Create task
TaskCreate({
  subject: "Run tests",
  description: "Execute test suite to verify changes",
  activeForm: "Running tests"
})

// Mark in progress
TaskUpdate({ taskId: "1", status: "in_progress" })

// Mark completed
TaskUpdate({ taskId: "1", status: "completed" })

// Check for next task
TaskList({})
```

## Dependencies

```javascript
// Task 2 depends on Task 1
TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })

// Task 1 blocks Task 2 (same thing, different direction)
TaskUpdate({ taskId: "1", addBlocks: ["2"] })
```

Tasks with `blockedBy` cannot be claimed until dependencies complete.

## Multi-Agent Coordination

```javascript
// Claim a task
TaskUpdate({ taskId: "1", owner: "subagent-name" })

// Get full details before working
TaskGet({ taskId: "1" })

// Work on task...

// Mark completed
TaskUpdate({ taskId: "1", status: "completed" })

// Find next available
TaskList({})
```

## Best Practices

### Creating Tasks

1. Use **imperative subjects** ("Fix bug" not "Fixing bug")
2. **Always provide activeForm** ("Fixing bug")
3. Include **acceptance criteria** in description
4. Check TaskList first to **avoid duplicates**

### Working Tasks

1. **Mark in_progress** before starting
2. **Prefer ID order** - lower IDs often set up context
3. **Only mark completed** when fully done
4. After completing, call TaskList for next task

### When Things Go Wrong

- **Don't mark completed** if:
  - Tests are failing
  - Implementation is partial
  - Errors encountered
  - Files not found
- Keep as `in_progress` and create new task for the blocker

## TaskUpdate Options

```javascript
TaskUpdate({
  taskId: "1",
  status: "in_progress",           // Change status
  subject: "New title",            // Update title
  description: "New details",      // Update description
  activeForm: "New spinner text",  // Update spinner
  owner: "agent-name",             // Assign owner
  metadata: { key: "value" },      // Merge metadata
  addBlocks: ["2", "3"],           // Add blocking
  addBlockedBy: ["0"]              // Add dependencies
})
```

## Pipeline Pattern

```javascript
TaskCreate({ subject: "Research" })      // → id: 1
TaskCreate({ subject: "Implement" })     // → id: 2
TaskCreate({ subject: "Test" })          // → id: 3
TaskCreate({ subject: "Document" })      // → id: 4

TaskUpdate({ taskId: "2", addBlockedBy: ["1"] })
TaskUpdate({ taskId: "3", addBlockedBy: ["2"] })
TaskUpdate({ taskId: "4", addBlockedBy: ["3"] })
```

Now tasks auto-unblock as each completes.
