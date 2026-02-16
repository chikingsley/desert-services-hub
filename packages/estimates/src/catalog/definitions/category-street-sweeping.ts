import type { CatalogCategory } from "@estimates/catalog/types";

export const streetSweepingCategory: CatalogCategory = {
  id: "street-sweeping",
  name: "Street Sweeping",
  items: [
    {
      code: "SS-001",
      name: "Street Sweeper w/ Operator",
      description:
        "On-demand mechanical sweeping for tracked mud & debris on public roads. 2 hr minimum. +10% fuel surcharge",
      price: 137,
      unit: "Hour",
      defaultQty: 2,
    },
  ],
};
