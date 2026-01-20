/**
 * Catalog Page
 */
import { useLoaderData } from "react-router";
import type { Bundle } from "@/components/catalog/bundles-section";
import { CatalogContent } from "@/components/catalog/catalog-content";
import { PageHeader } from "@/components/page-header";

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

// Loader function for fetching catalog
export async function catalogLoader() {
  const response = await fetch("/api/catalog");
  if (!response.ok) {
    throw new Error("Failed to load catalog");
  }
  return response.json();
}

export function CatalogPage() {
  const data = useLoaderData() as CatalogData;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Catalog" }]}
        description="Service catalog (read-only)"
        title="Catalog"
      />
      <div className="flex-1 overflow-auto p-6 lg:p-8">
        <CatalogContent
          initialBundles={data.bundles ?? []}
          initialData={data.categories}
          readOnly={data.readOnly ?? true}
        />
      </div>
    </div>
  );
}
