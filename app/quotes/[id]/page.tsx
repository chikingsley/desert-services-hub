import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { QuoteEditor } from "@/components/quotes/quote-editor";
import { createClient } from "@/lib/supabase/server";

interface QuotePageProps {
  params: Promise<{ id: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuotePage({ params }: QuotePageProps) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch the quote with current version, sections, and line items
  const { data: quote, error } = await supabase
    .from("quotes")
    .select(`
      *,
      quote_versions (
        id,
        version_number,
        total,
        is_current,
        created_at,
        change_summary
      )
    `)
    .eq("id", id)
    .single();

  if (error || !quote) {
    notFound();
  }

  const currentVersion = quote.quote_versions?.find(
    (v: { is_current: boolean }) => v.is_current
  );

  if (!currentVersion) {
    notFound();
  }

  // Fetch sections and line items for the current version
  const [sectionsResult, lineItemsResult, catalogResult] = await Promise.all([
    supabase
      .from("quote_sections")
      .select("*")
      .eq("version_id", currentVersion.id)
      .order("sort_order"),
    supabase
      .from("quote_line_items")
      .select("*")
      .eq("version_id", currentVersion.id)
      .order("sort_order"),
    supabase
      .from("catalog_items")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("description"),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Quotes", href: "/quotes" },
          { label: quote.job_name },
        ]}
        title={quote.base_number}
      />

      <QuoteEditor
        catalogItems={catalogResult.data || []}
        currentVersion={currentVersion}
        lineItems={lineItemsResult.data || []}
        quote={quote}
        sections={sectionsResult.data || []}
      />
    </div>
  );
}
