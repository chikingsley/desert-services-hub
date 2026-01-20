/**
 * Catalog Page
 */
import { PageHeader } from "@/components/page-header";

export function CatalogPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader description="Manage your service catalog" title="Catalog" />
      <div className="flex-1 p-6 lg:p-8">
        <p className="text-muted-foreground">
          Catalog management UI coming soon.
        </p>
      </div>
    </div>
  );
}
