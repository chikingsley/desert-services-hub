# Design Idea: Project-as-Accumulator Model

*Captured from chat, Jan 2026*

## The Wrong Approach: Email-Level Triage

Initially considered building a triage agent that:

- Receives each classified email
- Decides routing (dust permit handler, contract handler, etc.)
- Guesses complexity based on keywords ("urgent", "ASAP")
- Makes decisions in isolation

**Why this doesn't work:**

- Too much guessing/heuristics
- Disconnected from actual project context
- Reacting to emails individually vs. seeing the full picture
- Goes against the core model of everything being linked

## The Right Approach: Project as Container

Projects accumulate everything from day one:

```
Day 1:  RFP email arrives → Project created
Day 3:  Drawings attached
Day 5:  Clarification emails
Day 8:  Site visit notes
Day 12: We submit bid
        ... wait ...
Day 30: "You won" email
        ↓
        Everything already there:
        - Original RFP
        - All drawings/specs
        - Q&A history
        - Our estimate
        - Project size/scope
```

When we win, we're not scrambling. The project container has full history. An agent picking it up has real context, not reconstructed guesses.

## Where Intelligence Should Sit

Not at the email level. After linking, looking at **project state**:

```
Email → Classify → Link to Project
                        ↓
                    PROJECT
                (accumulates everything)
                        ↓
                Project-level view
                sees full package
                        ↓
                Decisions made here
                with real context
```

Triggers based on project state, not individual emails:

- "Project has contract email but no signed PDF"
- "Project has dust permit app + signed contract → ready to process"
- "Project has 5 unread emails in 3 days → needs attention"

## The Real Work

1. **Linking accuracy** - every email/doc lands in the right project
2. **Project completeness** - estimate ID, drawings, scope details filled in
3. **Surface gaps** - "Project X missing estimate link"

Classification still happens (it's cheap, pattern-based). But triage/routing isn't about emails → agents. It's about ensuring project completeness so when action is needed, context is there.

## Open Questions

- How good is linking today? How many orphaned emails?
- What fields does the `projects` table need that it doesn't have?
- What does "project ready for action" actually look like?
