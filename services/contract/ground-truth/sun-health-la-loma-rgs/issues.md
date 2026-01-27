# Sun Health La Loma RGS — Issues Log

Problems encountered during processing. These need to be addressed in tooling/prompts to prevent recurrence.

---

## Fabricated Information

### 1. Scope items made up

- **"SWPPP inspections (24 visits)"** — Estimate says 40 visits. "24" was invented.
- **"NOI/NOT filing"** — Not in the PO or estimate anywhere. Completely fabricated.
- **"BMP installation and maintenance"** — BMP installation is partially true (filter sock, inlet protection), but "maintenance" is explicitly excluded per the estimate ("Maintenance and Removal is not included unless specifically listed above as a line item"). Made up.
- **"Dust permit procurement and management"** — Permit filing is in the estimate. "Management" is not. Embellished.

### 2. Owner assumed

- Listed "Sun Health" as the Owner. The PO never identifies the owner. "Sun Health La Loma" is the project name. Owner was guessed.

### 3. David Speake review

- Listed as an open item in the internal email. No basis for this — it was mentioned by the user in conversation as something to look into, then presented in the email as if it were an established step. (Hallucinated)

### 4. Retention stated as 5%

- Early drafts said "Retention: 5%". The PO does not specify retention. Made up.

### 5. Billing stated as "Textura, Net 30"

- PO says invoices paid "10 working days following receipt of funds from the Owner" and invoices go to <PWIAP@pwiconstruction.com>. It does not mention Textura. The estimate had a Textura line item but the GC removed it. "Net 30" was invented.

---

## Duplicate Line Item Error

### 6. Dust Control Permit Filing counted twice

- OCR output showed two lines at $1,630 each. The second line was a description ("Includes jurisdictional filing fee and acreage-based permit costs"), not a separate charge. Initially counted as $3,260 instead of $1,630. Caught during reconciliation math check.

---

## Misclassification

### 7. Document called "Contract" instead of "Purchase Order"

- The PO was consistently referred to as a "contract" throughout processing — in the email subject ("Contract Intake"), file name ("Contract-260126-..."), and notes.md terminology. It's a Purchase Order. Caught by user on review.

### 8. COI endorsement details fabricated in internal email

- Insurance section listed "COI needed: Additional Insured for Owner + PWI Construction, Waiver of Subrogation, Primary and Non-Contributory." While those requirements exist in the PO's insurance page, the internal email presented them as COI action items without basis for that framing. The insurance was already reviewed and met requirements — no COI endorsement changes were needed.

---

## Missing Data

### 9. Dust permit status wrong

- Internal email said "Dust permit filed Dec 22" when the permit was actually **issued** on Jan 12, 2026 (Application D0063234, Facility ID F039203, Maricopa County). The filing date was Dec 22 but the issued date was readily available in email. Failed to check for permit issuance emails.

### 10. Email history not reviewed before drafting

- The full email history (Dec 2025 – Jan 2026) was not reviewed before drafting the internal email. This caused missed context: dust permit issuance, BMP mobilization request (Jan 8), Procore invite (Dec 16), and the fact that Desert was working without a signed PO for weeks. All of this was in the emails.

---

## Process Failures

### 11. Summarized from memory instead of documents

- The internal email scope was written from memory of a previous session's analysis rather than going back to the actual PO and estimate text. This is how the fabrications happened.

### 12. No verification step

- No step in the workflow to cross-check drafted email content against source documents before creating the draft.

### 13. SOV section fabricated

- An "SOV" (Schedule of Values) section was added to notes.md that was just a reorganization of estimate line items. The estimate has no SOV. It was presented as if the document contained one.

---

## Fixes Needed

- Extraction and email drafting must pull directly from document text, not from memory or summary
- Internal handoff template needs to reference the reconciliation output, not a free-form scope summary
- Consider adding a verification prompt/step that compares drafted content against source OCR before finalizing
- "If it's not in the documents, it doesn't go in the output" must be enforced programmatically, not just as a guideline
- Classify document type correctly (PO vs contract vs subcontract) and carry that through all outputs
- Always search for permit status emails before stating permit status — check for "issued" not just "filed"
- Review full email history for a project before drafting any internal communications
