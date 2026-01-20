import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function TakeoffsPage() {
  // TODO: Fetch takeoffs from SQLite via /api/takeoffs and display in table

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/takeoffs/new">
              <Plus className="mr-2 h-4 w-4" />
              New Takeoff
            </Link>
          </Button>
        }
        breadcrumbs={[{ label: "Takeoffs" }]}
        title="Takeoffs"
      />

      <div className="flex-1 p-6">
        <EmptyState
          action={
            <Button asChild>
              <Link href="/takeoffs/new">
                <Plus className="mr-2 h-4 w-4" />
                Upload PDF
              </Link>
            </Button>
          }
          description="Upload a site plan PDF to start measuring and counting items."
          title="No takeoffs yet"
        />
      </div>
    </div>
  );
}
