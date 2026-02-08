/**
 * Catalog Page
 */
import useSWR from "swr";
import type { Bundle } from "@/apps/web/frontend/components/catalog/bundles-section";
import { CatalogContent } from "@/apps/web/frontend/components/catalog/catalog-content";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface CatalogData {
  categories: Array<{
    id: string;
    name: string;
    selectionMode: string;
    supportsTakeoff: boolean;
    sortOrder: number;
    items: Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      price: number;
      unit: string;
      notes: string | null;
      defaultQty: number;
      isActive: boolean;
      isTakeoffItem: boolean;
      sortOrder: number;
    }>;
    subcategories: Array<{
      id: string;
      name: string;
      selectionMode: string;
      hidden: boolean;
      sortOrder: number;
      items: Array<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        price: number;
        unit: string;
        notes: string | null;
        defaultQty: number;
        isActive: boolean;
        isTakeoffItem: boolean;
        sortOrder: number;
      }>;
    }>;
  }>;
  bundles: Bundle[];
  readOnly?: boolean;
}

export function CatalogPage() {
  const { data, error, isLoading } = useSWR<CatalogData>(
    "/api/catalog",
    fetcher
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Catalog" }]}
        description="Service catalog (read-only)"
        title="Catalog"
      />
      {error && <PageError message={error.message} />}
      {!error && (isLoading || !data) && <PageLoading />}
      {!error && data && (
        <div className="flex-1 overflow-auto p-6 lg:p-8">
          <CatalogContent
            initialBundles={data.bundles ?? []}
            initialData={data.categories}
            readOnly={data.readOnly ?? true}
          />
        </div>
      )}
    </div>
  );
}
