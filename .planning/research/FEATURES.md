# Feature Landscape: Contract Intake & Task Management

**Domain:** Construction contract intake with automated task spawning
**Researched:** 2026-01-22
**Overall Confidence:** HIGH (leverages existing codebase patterns + industry research)

---

## Executive Summary

Contract intake systems in construction have evolved from manual triage to AI-powered orchestration. The table stakes are basic automation (email detection, document parsing, task creation). The differentiators are context-rich task spawning with linked artifacts and domain-specific workflow automation. For Desert Services, the existing infrastructure (email classification, contract parsing, Notion integration) provides a strong foundation - the key innovation is connecting these pieces into an orchestrated flow where contracts automatically spawn contextualized tasks.

---

## 1. Email-to-Task Automation

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Email detection/filtering** | Must identify contract emails vs noise; 40% of email-driven revenue comes from automation (Omnisend 2025) | Low | Existing: `classify.ts` handles CONTRACT classification |
| **Keyword-based triggers** | Users expect subject/sender patterns to trigger workflows without configuration | Low | Existing: Pattern matching in `classify.ts` |
| **Duplicate prevention** | Same contract arriving in multiple inboxes shouldn't spawn duplicate tasks | Medium | Existing: `findOrCreateByTitle/Email` in Notion client |
| **Basic task creation** | Contract email = tasks created, no manual step | Medium | Existing: Notion `create_page` tool |
| **Audit trail** | Know which email spawned which tasks for tracing issues | Low | New: Link email ID to task metadata |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Smart contract detection** | Pattern + LLM hybrid classification (existing in codebase) achieves 95%+ accuracy vs pattern-only 70-80% | Low | Existing: `classifyByPattern` + `classifyByLLM` fallback |
| **Context carryforward** | Tasks include original email thread link, not just "new contract arrived" | Medium | New: Extract `conversationId`, store as task metadata |
| **Attachment awareness** | Auto-detect multi-document packages (contract + exhibits), not just single PDFs | Medium | Existing: `attachmentNames` array, `download_attachment` tool |
| **Urgency detection** | Detect deadline mentions ("due Friday", "respond by EOD") and flag tasks accordingly | High | New: LLM extraction of deadlines from email body |
| **Thread-aware dedup** | Recognize follow-up emails in same thread shouldn't re-spawn tasks | Medium | Existing: `get_email_thread` tool provides conversation context |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-reply acknowledgments** | Feels robotic, annoys contractors who want human contact | Let tasks spawn silently; human sends personalized response from task |
| **Complex rule builders** | Users won't configure them; creates maintenance burden | Opinionated defaults + LLM fallback for edge cases |
| **Real-time triggers** | Polling every minute burns API quota, minimal benefit | Batch processing every 5-15 minutes is sufficient |
| **Email threading UI** | Don't rebuild Gmail; just link to original | Store email ID, generate link to Outlook/Gmail web view |

---

## 2. Document Parsing & Context Extraction

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **PDF text extraction** | Must read contract content, not just filenames | Low | Existing: Jina AI integration in `contract/client.ts` |
| **Project name extraction** | Core identifier needed for all downstream tasks | Low | Existing: `project.name` in CONTRACT_SCHEMA |
| **Contractor name extraction** | Must know who sent the contract | Low | Existing: `contractor.name` in CONTRACT_SCHEMA |
| **Contact info extraction** | Need email/phone to create follow-up tasks | Medium | Existing: `contractor.email`, `contractor.phone` |
| **Multi-page handling** | Real contracts are 50+ pages; can't fail on large docs | Low | Existing: `extractPages()` truncates intelligently |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Structured schema extraction** | Not just "text blob" but typed fields (amounts, dates, parties) | Medium | Existing: Full CONTRACT_SCHEMA with Gemini |
| **Comprehensive requirements extraction** | Red flags, site requirements, financial terms - full subcontractor briefing | High | Existing: Stage 2 extraction with COMPREHENSIVE_REQUIREMENTS_SCHEMA |
| **Multi-document package processing** | Process entire folder (subcontract + exhibits A-F) as one unit | Medium | Existing: `processContractFolder()` with consolidation |
| **Estimate matching** | Link incoming contract to original estimate for reconciliation | High | New: Fuzzy match against Monday ESTIMATING board |
| **Document classification** | Know it's EXHIBIT_A (scope) vs EXHIBIT_D (insurance) | Low | Existing: `FILENAME_PATTERNS` + LLM classification |
| **Drawing vs text detection** | Don't waste OCR on image-heavy PDFs, use vision model | Low | Existing: `kbPerPage > 300` triggers vision mode |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Line-item extraction** | Contracts reference estimate line items, don't duplicate them | Pull line items from linked Monday estimate |
| **Version diffing** | Contract versions are complex; humans must review | Flag "revised" in subject, let human compare |
| **Handwritten signature detection** | Low value, high complexity, legally irrelevant | Just note "fully executed" vs "for signature" status |
| **Full OCR re-extraction** | Expensive for every request; most contracts are searchable PDFs | Check if text extraction works first, vision only as fallback |

---

## 3. Task Assignment & Tracking

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Task creation** | The core value prop - contracts spawn tasks | Low | Existing: Notion `create_page` |
| **Task ownership** | Each task has an assignee | Low | Notion "Assign" person property |
| **Status tracking** | Know what's pending/in-progress/done | Low | Notion status property |
| **Due dates** | Tasks need deadlines | Low | Notion date property |
| **Task linking** | Tasks related to same contract are connected | Medium | Notion relations or shared metadata |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Pre-defined task templates** | The 7 specific tasks spawn automatically with correct defaults | Low | Configuration-driven task definitions |
| **Context attachment per task** | Each task has relevant context (reconcile task gets estimate link; email task gets contact info) | Medium | Task-specific context mapping |
| **Sequential dependencies** | "Notify team" shouldn't happen until "Reconcile" is done | Medium | Task dependency chains |
| **Role-based assignment** | Tasks auto-assign to correct role (Chi for reconcile, Jayson for dust permits) | Low | Role-to-person mapping configuration |
| **Bulk status updates** | Complete "Email contractor" marks related tasks as unblocked | Medium | Dependency-aware status propagation |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Time tracking** | Not the goal; this is task spawning, not project management | Integrate with existing time tracking if needed later |
| **Resource allocation** | Out of scope; just assign to the right person | Static role assignments work for small team |
| **Gantt charts** | Tasks are checkbox items, not project schedules | Use Notion timeline view if needed |
| **Recurring tasks** | Contract intake is event-driven, not scheduled | Each contract spawns fresh tasks |
| **Custom task types** | Keep it simple - these 7 tasks cover the workflow | Hardcode the task types, make content configurable |

---

## 4. Notion as Task Interface

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Task database** | Single place to see all contract intake tasks | Low | Existing: Notion database tools |
| **Filtering by status** | "Show me pending tasks" | Low | Existing: `query_database` with filters |
| **Filtering by assignee** | "Show me my tasks" | Low | Existing: `query_database` with person filter |
| **Task details** | Click task to see full context | Low | Notion page properties + content blocks |
| **Mobile access** | Notion mobile app provides this free | Low | No dev work - Notion feature |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Linked artifacts** | Task page includes contract PDF preview, estimate link, contact info | Medium | `upload_file` + `appendFileBlockToPage` |
| **Quick actions** | Task page has buttons/links for common actions (open Monday, compose email) | Low | URL links in task properties or content |
| **Dashboard view** | "Contracts This Week" with status summary | Low | Notion database views |
| **Project grouping** | Tasks grouped by project/contract | Low | Notion grouping by relation or property |
| **Status automation** | API updates task status when human completes action | Medium | `update_page` after workflow steps |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom Notion integrations** | Complex, fragile, unnecessary | Use standard Notion API; people use Notion's native features |
| **Real-time sync** | Notion API has rate limits; batch updates are sufficient | Update on task creation and major state changes |
| **Embedded task completion** | Don't rebuild task management in our app | Link to Notion; let people work in Notion |
| **Notion template management** | Let users manage templates in Notion directly | Document expected database schema, don't enforce |
| **Comment sync** | Notion handles comments natively | Just create tasks; discussions happen in Notion |

---

## Feature Dependencies

```
Email Classification (existing)
       │
       ▼
Contract Detection ──────────────────┐
       │                             │
       ▼                             │
Document Parsing (existing)          │
       │                             │
       ├──────────────┐              │
       ▼              ▼              ▼
Project Info    Contact Info    Email Context
       │              │              │
       └──────────────┼──────────────┘
                      │
                      ▼
              Estimate Matching (NEW)
                      │
                      ▼
              Task Template Selection
                      │
    ┌─────────────────┼─────────────────┐
    ▼                 ▼                 ▼
Task 1: Reconcile  Task 2: Email    Task 3: Update QB
(needs estimate)   (needs contact)  (needs project)
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
                      ▼
              Notion Task Creation
              (with role assignment)
                      │
                      ▼
              Link Artifacts to Tasks
              (PDF, estimate, contact)
```

### Critical Path

1. **Email detection** must work reliably (existing - HIGH confidence)
2. **Document parsing** must extract project name (existing - HIGH confidence)
3. **Estimate matching** is the key NEW capability needed
4. **Task template system** connects parsing output to task inputs
5. **Notion integration** creates tasks with context (existing tools, NEW orchestration)

---

## MVP Recommendation

### Must Have (Phase 1)

1. **Contract email detection** - Use existing `classify.ts` with CONTRACT classification
2. **Basic document parsing** - Use existing `contract/client.ts` for project/contractor extraction
3. **7 task template definitions** - Configure the specific tasks to spawn
4. **Notion task creation** - Use existing tools to create tasks in a designated database
5. **Basic context linking** - Attach email ID and parsed project name to tasks

### Should Have (Phase 2)

1. **Estimate matching** - Link contract to original Monday estimate
2. **Rich context per task** - Each task gets its relevant slice of parsed data
3. **PDF attachment to Notion** - Upload contract PDF to task page
4. **Role-based assignment** - Auto-assign tasks to correct people
5. **Task dependencies** - Block "notify team" until "reconcile" is done

### Could Have (Phase 3)

1. **Deadline detection** - Extract urgency from email body
2. **Dashboard views** - Summary views in Notion for management visibility
3. **Status automation** - Update task status when external actions complete
4. **Multi-document handling** - Process contract packages (subcontract + exhibits)

### Defer (Post-MVP)

- Custom Notion views/templates (let users build these)
- Real-time email monitoring (batch is fine)
- Complex workflow rules (start simple, add complexity if needed)
- Integration with other systems beyond Monday/Notion/QuickBooks

---

## Complexity Assessment

| Feature Area | Complexity | Confidence | Notes |
|--------------|------------|------------|-------|
| Email classification | Low | HIGH | Existing implementation |
| Document parsing | Low | HIGH | Existing implementation |
| Estimate matching | Medium | MEDIUM | New capability, fuzzy matching needed |
| Task template system | Low | HIGH | Configuration-driven |
| Notion task creation | Low | HIGH | Existing tools |
| Context attachment | Medium | MEDIUM | Mapping parser output to task-specific context |
| Task dependencies | Medium | MEDIUM | Simple blocked-by relations |
| Role assignment | Low | HIGH | Static mapping |

---

## Sources

- [Superhuman: How to use AI to automate tasks](https://blog.superhuman.com/how-to-use-ai-to-automate-tasks/)
- [Unstract: Contract OCR Guide](https://unstract.com/blog/contract-ocr-guide-to-extracting-data-from-contracts/)
- [ContractPod AI: Automate Contract Data Extraction](https://contractpodai.com/news/automate-contract-data-extraction/)
- [Zoho Projects: Essential Features of Task Management Software](https://www.zoho.com/projects/task-management/essential-features.html)
- [Digital Project Manager: Best Task Management Software](https://thedigitalprojectmanager.com/tools/best-task-management-software/)
- [Notion API Documentation](https://developers.notion.com/docs/create-a-notion-integration)
- [Everhour: Best Notion Integrations](https://everhour.com/blog/notion-integrations/)
- [Pactly: How to Automate Your Contract Management Workflow](https://www.pactly.com/blog/how-to-automate-your-contract-management-workflow/)
- [Neuroject: Workflow Automation in Construction Guide 2025](https://neuroject.com/workflow-automation-in-construction/)
- [Affinda: Email Classification and Routing](https://www.affinda.com/use-cases/email-classification-and-routing)
- [Upbrain AI: AI-Powered Email Automation](https://upbrains.ai/blog/ai-powered-email-automation-a-document-focused-path-to-streamlined-business-workflows)
- Codebase analysis: `services/contract/client.ts`, `services/email/census/classify.ts`, `services/notion/mcp-server.ts`
