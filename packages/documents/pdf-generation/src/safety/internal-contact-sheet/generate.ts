import { saveInternalContactSheetPDF } from "@documents/pdf/internal-contact-sheet/generate-internal-contact-sheet-pdf.server";
import type {
  InternalContactRow,
  InternalContactSheetDocument,
} from "@documents/pdf/internal-contact-sheet/types";
import { db } from "@lib/db/client";

interface ContactDbRow {
  company_phone: string | null;
  email: string | null;
  mobile_phone: string | null;
  name: string;
  office_phone: string | null;
  phone: string | null;
  title: string | null;
}

const ROLE_PROJECT_MANAGER = "Project Manager";
const ROLE_PROJECT_COORDINATOR = "Project Coordinator";
const ROLE_DISPATCHER_COORDINATOR = "Dispatcher / Coordinator";
const ROLE_BILLING_CONTACT = "Billing Contact";
const ROLE_FIELD_SUPERVISOR = "Field Supervisor";

const ROLE_ORDER = [
  ROLE_PROJECT_MANAGER,
  ROLE_PROJECT_COORDINATOR,
  ROLE_DISPATCHER_COORDINATOR,
  ROLE_BILLING_CONTACT,
  ROLE_FIELD_SUPERVISOR,
] as const;

function pickPhone(row: ContactDbRow): string {
  return (
    row.phone ?? row.office_phone ?? row.mobile_phone ?? row.company_phone ?? ""
  );
}

function asRow(row: ContactDbRow): InternalContactRow {
  return {
    role: row.title ?? "",
    name: row.name,
    email: row.email ?? "",
    phone: pickPhone(row),
    notes: "",
  };
}

export async function loadInternalContactSheetDoc(): Promise<InternalContactSheetDocument> {
  const contacts = await db
    .query<ContactDbRow>(
      `SELECT name, email, title, phone, office_phone, mobile_phone, company_phone
     FROM contacts
     WHERE contact_type = 'internal_team'
       AND is_active = true
       AND title IN ($1, $2, $3, $4, $5)
     ORDER BY
       CASE title
         WHEN 'Project Manager' THEN 1
         WHEN 'Project Coordinator' THEN 2
         WHEN 'Dispatcher / Coordinator' THEN 3
         WHEN 'Billing Contact' THEN 4
         WHEN 'Field Supervisor' THEN 5
         ELSE 99
       END,
       updated_at DESC`
    )
    .all(
      ROLE_PROJECT_MANAGER,
      ROLE_PROJECT_COORDINATOR,
      ROLE_DISPATCHER_COORDINATOR,
      ROLE_BILLING_CONTACT,
      ROLE_FIELD_SUPERVISOR
    );

  const byTitle = new Map<string, ContactDbRow>();
  for (const c of contacts) {
    if (!c.title) {
      continue;
    }
    if (!byTitle.has(c.title)) {
      byTitle.set(c.title, c);
    }
  }

  const rows: InternalContactRow[] = ROLE_ORDER.map((role) => {
    const hit = byTitle.get(role);
    if (!hit) {
      return {
        role,
        name: role === "Field Supervisor" ? "TBD" : "",
        notes: "",
      };
    }
    return asRow(hit);
  });

  return {
    title: "Internal Contact Sheet",
    subtitle: "Safety / Project Coordination Contacts",
    updated: new Date().toISOString().slice(0, 10),
    contacts: rows,
  };
}

export async function generatePdf(outputPdfPath: string): Promise<string> {
  const doc = await loadInternalContactSheetDoc();
  return await saveInternalContactSheetPDF(doc, outputPdfPath);
}
