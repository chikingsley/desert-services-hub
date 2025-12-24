import { PageHeader } from "@/components/page-header";
import { NewQuoteForm } from "@/components/quotes/new-quote-form";

export default function NewQuotePage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Quotes", href: "/quotes" },
          { label: "New Quote" },
        ]}
        title="New Quote"
      />

      <div className="flex-1 p-6">
        <NewQuoteForm />
      </div>
    </div>
  );
}
