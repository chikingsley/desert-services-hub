import type { CatalogCategory } from "@/packages/estimates/catalog/types";

export const siteCleaningCategory: CatalogCategory = {
  id: "site-cleaning",
  name: "Site Cleaning",
  items: [
    {
      code: "SC-001",
      name: "Site Cleaning Labor",
      description:
        "Interior/exterior site cleaning. 4 hr minimum unless regularly scheduled",
      price: 45,
      unit: "Hour",
      defaultQty: 4,
    },
  ],
};
