import { saveInternalContactSheetPDF } from "@documents/pdf/internal-contact-sheet/generate-internal-contact-sheet-pdf.server";
import type {
  InternalContactRow,
  InternalContactSheetDocument,
} from "@documents/pdf/internal-contact-sheet/types";
import { sql } from "bun";

interface ContactDbRow {
  name: string;
  email: string | null;
  title: string | null;
  phone: string | null;
  office_phone: string | null;
  mobile_phone: string | null;
  company_phone: string | null;
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
  const contacts = (await sql`
    select
      name,
      email,
      title,
      phone,
      office_phone,
      mobile_phone,
      company_phone
    from contacts
    where contact_type = 'internal_team'
      and is_active = true
      and title in (
        ${ROLE_PROJECT_MANAGER},
        ${ROLE_PROJECT_COORDINATOR},
        ${ROLE_DISPATCHER_COORDINATOR},
        ${ROLE_BILLING_CONTACT},
        ${ROLE_FIELD_SUPERVISOR}
      )
    order by
      case title
        when 'Project Manager' then 1
        when 'Project Coordinator' then 2
        when 'Dispatcher / Coordinator' then 3
        when 'Billing Contact' then 4
        when 'Field Supervisor' then 5
        else 99
      end,
      updated_at desc
  `) as ContactDbRow[];

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
