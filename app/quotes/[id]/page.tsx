import { notFound } from "next/navigation";
import { QuoteWorkspace } from "@/components/quotes/quote-workspace";
import { db } from "@/lib/db";
import type {
  EditorLineItem,
  EditorQuote,
  EditorSection,
  QuoteLineItemRow,
  QuoteRow,
  QuoteSectionRow,
  QuoteVersionRow,
} from "@/lib/types";

interface QuotePageProps {
  params: Promise<{ id: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: QuotePageProps) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  // Fetch the quote from SQLite
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as
    | QuoteRow
    | undefined;

  if (!quote) {
    notFound();
  }

  // Get current version
  const currentVersion = db
    .prepare(
      "SELECT * FROM quote_versions WHERE quote_id = ? AND is_current = 1"
    )
    .get(id) as QuoteVersionRow | undefined;

  if (!currentVersion) {
    notFound();
  }

  // Fetch linked takeoff if this quote was created from one
  let linkedTakeoff: { id: string; name: string } | null = null;
  if (quote.takeoff_id) {
    const takeoffRow = db
      .prepare("SELECT id, name FROM takeoffs WHERE id = ?")
      .get(quote.takeoff_id) as { id: string; name: string } | undefined;
    if (takeoffRow) {
      linkedTakeoff = takeoffRow;
    }
  }

  // Fetch sections and line items
  const sectionsData = db
    .prepare(
      "SELECT * FROM quote_sections WHERE version_id = ? ORDER BY sort_order"
    )
    .all(currentVersion.id) as QuoteSectionRow[];

  const lineItemsData = db
    .prepare(
      "SELECT * FROM quote_line_items WHERE version_id = ? ORDER BY sort_order"
    )
    .all(currentVersion.id) as QuoteLineItemRow[];

  // Convert SQLite data to EditorQuote format
  const sections: EditorSection[] = sectionsData.map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const lineItems: EditorLineItem[] = lineItemsData.map((item) => ({
    id: item.id,
    item: item.description,
    description: item.notes || "",
    qty: item.quantity,
    uom: item.unit,
    cost: item.unit_price,
    total: item.quantity * item.unit_price,
    sectionId: item.section_id || undefined,
    isStruck: item.is_excluded === 1,
  }));

  const total = lineItems
    .filter((item) => !item.isStruck)
    .reduce((sum, item) => sum + item.total, 0);

  const initialQuote: EditorQuote = {
    estimateNumber: quote.base_number,
    date: quote.created_at || new Date().toISOString(),
    estimator: "",
    estimatorEmail: "",
    billTo: {
      companyName: quote.client_name || "",
      address: "",
      email: quote.client_email || "",
      phone: quote.client_phone || "",
    },
    jobInfo: {
      siteName: quote.job_name || "",
      address: quote.job_address || "",
    },
    sections,
    lineItems,
    total,
  };

  return (
    <QuoteWorkspace
      initialQuote={initialQuote}
      jobName={quote.job_name || quote.base_number}
      linkedTakeoff={linkedTakeoff}
      quoteId={id}
      versionId={currentVersion.id}
    />
  );
}
