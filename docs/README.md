# Desert Services Workbench

## The Goal

**Inbox zero.** Email is not a to-do list.

Everything that requires action gets pulled out of email and tracked in Notion where it's visible, assignable, and won't get lost.

---

## The Problem

Work arrives via email to `internal-contracts@desertservices.net` (a Microsoft 365 group). Currently:

- It's a black box - things go in, hope someone figures out what to do
- No visibility into what's pending or stuck
- No one managing the actual project management of it
- Things get lost in the noise

The estimators and coordinators are expected to "just know" what needs doing by checking email. That doesn't scale.

---

## The Solution

**Pull everything into Notion.**

| System | Purpose |
|--------|---------|
| **Email** | Inbox only - triage and extract, not store |
| **Notion** | Projects, Tasks, tracking - the source of truth for "what needs to happen" |
| **Monday** | Estimates, Leads, Sales (pre-project) |
| **SharePoint** | Documents (PDFs, contracts, plans) |

### The workflow

1. Email arrives
2. Identify what it is (contract, permit request, SWPPP request, etc.)
3. Create/update Project in Notion
4. Create Task(s) for what needs to happen
5. Archive email - it's no longer a to-do

The email is just a signal. The work lives in Notion.

---

## Short-Term Reality

This will create more work initially:

- The task list will get large (possibly ridiculous)
- You have to actively track things that used to just... sit in email
- Every email becomes a conscious decision: what project? what task?

But at least:

- Nothing gets lost
- You can see what's waiting
- You can assign things to people
- You can filter by project, by due date, by tag
- When someone asks "what's the status?" you have an answer

---

## Notion Structure

### Projects Database

Where projects live. A project is created when we have work to do (contract received, permit requested, etc.)

**Status flow:**

```text
Intake → Contract Review → Compliance → Schedule → Operations → Done
```

### Tasks Database

Individual action items. Every task links to a project.

**Status flow:**

```text
Not Started → In Progress → Waiting on Response → Done
```

**Tags:** Dust Permit, Contracts, Process Improvement

**Views:**

- "Need Action" - things that haven't been touched recently but aren't done
- "By Project" - grouped by project
- "Board" - kanban by status

---

## Key Docs

| Doc | What it covers |
|-----|----------------|
| [PM Workflow](./planning/pm-workflow.md) | Daily workflow - what to do when email arrives |
| [Project Management](./planning/project-management.md) | Process design - stages, handoffs, checklists |
| [User Stories](./planning/user-stories.md) | Detailed requirements |
| [CLI Tools](./CLI_TOOLS.md) | Developer tools for testing and generation |

---

## The Endgame

Once everything is out of the inbox:

1. **Per-project view** makes sense - see all tasks for a project
2. **Due date rollups** let you see what's urgent across all projects
3. **Assignee views** let people see their own workload
4. **Automation** can create tasks when emails arrive (eventually)

But first: get it out of the inbox.
