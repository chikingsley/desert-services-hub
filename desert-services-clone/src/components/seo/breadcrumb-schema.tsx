import type { BreadcrumbList, WithContext } from "schema-dts";
import { JsonLd } from "@/components/seo/json-ld";

interface BreadcrumbItem {
  name: string;
  url?: string;
}

export function BreadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  const data: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };

  return <JsonLd data={data} />;
}
