/**
 * Seed the monday_columns table with the column plan
 */

import { db } from "./schema";

interface MondayColumnSeed {
  column_name: string;
  monday_id: string | null;
  monday_type: string | null;
  action: "keep" | "delete" | "add" | "copy_at_creation";
  notes: string;
}

const columns: MondayColumnSeed[] = [
  // === KEEP AS-IS ===
  {
    column_name: "Name",
    monday_id: "name",
    monday_type: "name",
    action: "keep",
    notes: "Project name",
  },
  {
    column_name: "Subitems",
    monday_id: "subtasks_mkp03e6s",
    monday_type: "subtasks",
    action: "keep",
    notes: "For tasks/notes if needed",
  },
  {
    column_name: "Project Owner",
    monday_id: "multiple_person_mks6ynp9",
    monday_type: "people",
    action: "keep",
    notes: "Who owns this project",
  },
  {
    column_name: "Project Status",
    monday_id: "status",
    monday_type: "status",
    action: "keep",
    notes: "Active/Complete/etc",
  },
  {
    column_name: "Inspection Reports",
    monday_id: "board_relation_mkpf1kvf",
    monday_type: "board_relation",
    action: "keep",
    notes: "Link to inspection reports",
  },
  {
    column_name: "Submit Inspection",
    monday_id: "link_mkrd9n97",
    monday_type: "link",
    action: "keep",
    notes: "Link to submit inspection",
  },
  {
    column_name: "Linked Estimate",
    monday_id: "board_relation_mktgn7cb",
    monday_type: "board_relation",
    action: "keep",
    notes: "Reference to source estimates - NO MIRRORS",
  },
  {
    column_name: "Building/House Number",
    monday_id: "text_mkp9tfw9",
    monday_type: "text",
    action: "keep",
    notes: "Address field",
  },
  {
    column_name: "City",
    monday_id: "text_mkp7xwpm",
    monday_type: "text",
    action: "keep",
    notes: "Address field",
  },
  {
    column_name: "Street",
    monday_id: "text_mkp7wdgq",
    monday_type: "text",
    action: "keep",
    notes: "Address field",
  },
  {
    column_name: "State",
    monday_id: "text_mkp7p1xc",
    monday_type: "text",
    action: "keep",
    notes: "Address field",
  },
  {
    column_name: "Zip Code",
    monday_id: "text_mkpbg1a0",
    monday_type: "text",
    action: "keep",
    notes: "Address field",
  },
  {
    column_name: "C/I",
    monday_id: "color_mkp9b0q2",
    monday_type: "status",
    action: "keep",
    notes: "Commercial/Industrial designation",
  },
  {
    column_name: "Project Created",
    monday_id: "date_mkws5a15",
    monday_type: "date",
    action: "keep",
    notes: "When project was created",
  },

  // === DELETE (mirrors and redundant) ===
  {
    column_name: "Location (mirror)",
    monday_id: "lookup_mktrxkzr",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror from estimate - replace with real field",
  },
  {
    column_name: "Account (mirror)",
    monday_id: "lookup_mktgnedy",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror from estimate - replace with Contractor text",
  },
  {
    column_name: "Contact (mirror)",
    monday_id: "lookup_mktgs814",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror from estimate",
  },
  {
    column_name: "Territory Owner (mirror)",
    monday_id: "lookup_mkxdrrhk",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Not needed on project",
  },
  {
    column_name: "Service Lines (mirror)",
    monday_id: "lookup_mktg3b6w",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror - use real field if needed",
  },
  {
    column_name: "Onsite Contact (mirror)",
    monday_id: "lookup_mktg32bm",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror from estimate",
  },
  {
    column_name: "Awarded Value (mirror)",
    monday_id: "lookup_mktg90j7",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror - replace with real Awarded Value",
  },
  {
    column_name: "Start Date (mirror)",
    monday_id: "lookup_mktg2473",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror - replace with real Start Date",
  },
  {
    column_name: "End Date (mirror)",
    monday_id: "lookup_mktgrjg",
    monday_type: "mirror",
    action: "delete",
    notes: "REDUNDANT: Mirror - replace with real End Date",
  },
  {
    column_name: "Mirror (unnamed)",
    monday_id: "lookup_mkxkarwp",
    monday_type: "mirror",
    action: "delete",
    notes: "JUNK: Unnamed mirror column",
  },
  {
    column_name: "Completion % (old)",
    monday_id: "formula_mkrn66h5",
    monday_type: "formula",
    action: "delete",
    notes: "OBSOLETE: Old formula",
  },
  {
    column_name: "Estimate Linked (status)",
    monday_id: "color_mktghepf",
    monday_type: "status",
    action: "delete",
    notes: "REDUNDANT: Board relation handles this",
  },
  {
    column_name: "Missing Estimate (checkbox)",
    monday_id: "boolean_mktjw1d7",
    monday_type: "checkbox",
    action: "delete",
    notes: "REDUNDANT: Board relation handles this",
  },
  {
    column_name: "Location (old)",
    monday_id: "location_mkqb4cqh",
    monday_type: "location",
    action: "delete",
    notes: "OBSOLETE: Replaced by address fields",
  },
  {
    column_name: "Start Date (old)",
    monday_id: "date_mkrnz0nb",
    monday_type: "date",
    action: "delete",
    notes: "OBSOLETE: Use real Start Date",
  },
  {
    column_name: "End Date (old)",
    monday_id: "date_mkrnxszs",
    monday_type: "date",
    action: "delete",
    notes: "OBSOLETE: Use real End Date",
  },
  {
    column_name: "Formula (unnamed)",
    monday_id: "formula_mkv5bsz",
    monday_type: "formula",
    action: "delete",
    notes: "JUNK: Unnamed formula",
  },
  {
    column_name: "RFP Contact Name",
    monday_id: "text_mkqyrs57",
    monday_type: "text",
    action: "delete",
    notes: "REDUNDANT: Lives on estimate, not project",
  },
  {
    column_name: "RFP Contractor Name",
    monday_id: "text_mkqywhqf",
    monday_type: "text",
    action: "delete",
    notes: "REDUNDANT: Lives on estimate, not project",
  },
  {
    column_name: "RFP Email",
    monday_id: "email_mkqyewqg",
    monday_type: "email",
    action: "delete",
    notes: "REDUNDANT: Lives on estimate, not project",
  },
  {
    column_name: "RFP Phone",
    monday_id: "phone_mkqy45kf",
    monday_type: "phone",
    action: "delete",
    notes: "REDUNDANT: Lives on estimate, not project",
  },
  {
    column_name: "General Contractor (text)",
    monday_id: "text_mkwa1wsb",
    monday_type: "text",
    action: "delete",
    notes: "REDUNDANT: Replace with proper Contractor field",
  },
  {
    column_name: "monday Doc v2",
    monday_id: "direct_doc_mkqy2krq",
    monday_type: "direct_doc",
    action: "delete",
    notes: "UNUSED: Delete if not being used",
  },
  {
    column_name: "Service Lines (board relation)",
    monday_id: "board_relation_mkp8pr9e",
    monday_type: "board_relation",
    action: "delete",
    notes: "REDUNDANT: Duplicate of mirror",
  },
  {
    column_name: "Estimated Revenue",
    monday_id: "numeric_mkqzr3mq",
    monday_type: "numbers",
    action: "delete",
    notes: "REDUNDANT: Use Awarded Value instead",
  },
  {
    column_name: "Estimate (file)",
    monday_id: "file_mkqzc9m1",
    monday_type: "file",
    action: "delete",
    notes: "REDUNDANT: Lives on estimate board",
  },

  // === ADD NEW (real fields) ===
  {
    column_name: "Project Number",
    monday_id: null,
    monday_type: "text",
    action: "add",
    notes: "NEW: Unique project identifier e.g. 1001, 1002",
  },
  {
    column_name: "Contractor",
    monday_id: null,
    monday_type: "text",
    action: "add",
    notes: "NEW: Real contractor name field (not mirror)",
  },
  {
    column_name: "PO Number",
    monday_id: null,
    monday_type: "text",
    action: "add",
    notes: "NEW: Purchase order number",
  },
  {
    column_name: "Awarded Value",
    monday_id: null,
    monday_type: "numbers",
    action: "add",
    notes: "NEW: Real awarded value (not mirror)",
  },
  {
    column_name: "Start Date",
    monday_id: null,
    monday_type: "date",
    action: "add",
    notes: "NEW: Real start date (not mirror)",
  },
  {
    column_name: "End Date",
    monday_id: null,
    monday_type: "date",
    action: "add",
    notes: "NEW: Real end date (not mirror)",
  },
  {
    column_name: "Location",
    monday_id: null,
    monday_type: "location",
    action: "add",
    notes: "NEW: Real location field (not mirror)",
  },
  {
    column_name: "Primary Contact",
    monday_id: null,
    monday_type: "text",
    action: "add",
    notes: "NEW: Main contact for this project",
  },

  // === ADD NEW (deliverable tracking) ===
  {
    column_name: "Contract Status",
    monday_id: null,
    monday_type: "status",
    action: "add",
    notes: "NEW DELIVERABLE: Pending / Received / Executed",
  },
  {
    column_name: "Contract File",
    monday_id: null,
    monday_type: "file",
    action: "add",
    notes: "NEW DELIVERABLE: Executed contract PDF",
  },
  {
    column_name: "SOV File",
    monday_id: null,
    monday_type: "file",
    action: "add",
    notes: "NEW DELIVERABLE: Schedule of Values attachment",
  },
  {
    column_name: "Dust Permit Status",
    monday_id: null,
    monday_type: "status",
    action: "add",
    notes: "NEW DELIVERABLE: Not Needed / Pending / Filed / Received",
  },
  {
    column_name: "Dust Permit File",
    monday_id: null,
    monday_type: "file",
    action: "add",
    notes: "NEW DELIVERABLE: Dust permit PDF",
  },
  {
    column_name: "NOI Status",
    monday_id: null,
    monday_type: "status",
    action: "add",
    notes: "NEW DELIVERABLE: Not Needed / In Progress / Submitted / Approved",
  },
  {
    column_name: "SWPPP Status",
    monday_id: null,
    monday_type: "status",
    action: "add",
    notes: "NEW DELIVERABLE: Not Needed / Drafting / Submitted / Approved",
  },
  {
    column_name: "Signs Status",
    monday_id: null,
    monday_type: "status",
    action: "add",
    notes: "NEW DELIVERABLE: Not Needed / Ordered / Received / Delivered",
  },
];

export function seedMondayColumns() {
  db.transaction(() => {
    db.run("DELETE FROM monday_columns");

    const stmt = db.prepare(`
      INSERT INTO monday_columns (column_name, monday_id, monday_type, action, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const col of columns) {
      stmt.run(
        col.column_name,
        col.monday_id,
        col.monday_type,
        col.action,
        col.notes
      );
    }
  })();

  const summary = db
    .query<{ action: string; count: number }, []>(`
      SELECT action, COUNT(*) as count FROM monday_columns GROUP BY action ORDER BY action
    `)
    .all();

  return {
    seeded: columns.length,
    summary,
  };
}

if (import.meta.main) {
  const result = seedMondayColumns();
  console.log(`Seeded ${result.seeded} columns`);
  console.log("\nSummary:");
  for (const row of result.summary) {
    console.log(`  ${row.action}: ${row.count}`);
  }
}
