import type { CatalogCategory } from "@estimates/catalog/types";

export const waterTrucksCategory: CatalogCategory = {
  id: "water-trucks",
  name: "Water Trucks",
  items: [
    {
      code: "WT-001",
      name: "Water Truck w/ Operator",
      description:
        "Dust control, soil stabilization, lot/street washes. 2 hr minimum. +10% fuel surcharge",
      price: 127,
      unit: "Hour",
      defaultQty: 2,
    },
    {
      code: "WT-002",
      name: "Soil Stabilization (Gorilla Glue)",
      description: "Covers vehicle, driver, and materials. +10% fuel surcharge",
      price: 2350,
      unit: "Acre",
    },
  ],
};
