# Diamond View at Ballpark

**Contractor:** Catamount Constructors Inc.
**Type:** Work Authorization (WA) - SWPPP/Dust Control

---

## Pattern: Scoped Liability vs Unscoped Liability

### The Lesson

Section 55 (SWPPP/Dust Control) contains language that **looks problematic but is actually OK** due to scope qualifiers.

### What Looks Bad

> "If a violation is issued to Catamount Constructors Inc. due to operations performed by Subcontractor, it shall become Subcontractor's responsibility to reimburse to Catamount Constructors Inc."

> "Subcontractor will be held responsible for any damage to existing onsite SWPP and erosion control materials."

At first glance, this reads like the "assume responsibility for fines" red flag.

### Why It's Actually OK

The key qualifier at the start of the section:

> "Subcontractor provide SWPPP/Dust Control for **all areas of Subcontractor's work area**"

This scopes ALL the liability language to **your own work area**. The entire section is "be responsible for yourself" language:

- Provide dust control **for your work**
- Cover **your** stockpiles
- Clean streets dirty **from your operations**
- Reimburse fines **due to operations performed by Subcontractor**
- Damage to SWPP **caused by you**

This is standard "you break it, you buy it" - not "you're liable for our problems."

### The Actual Red Flag (for reference)

Unscoped language like:

- "Subcontractor assumes responsibility for all fines"
- "Subcontractor shall be liable for any fines issued on project"
- No qualifier limiting it to subcontractor's own actions

### Validation Rule Implication

The `NO_FINES_LIABILITY` rule should check for **unscoped** fines language. If the liability is scoped to "Subcontractor's operations" or "Subcontractor's work area" - it's standard self-responsibility, not a red flag.

**Pattern:** Look for scope qualifiers before flagging fines/liability language.

---

## Contract Details

- **File:** `contract-wa-revision1.pdf`
- **Relevant Section:** 55 - SWPPP/Dust Control (subsections a-g)
- **Verdict:** OK - scoped liability, standard terms
