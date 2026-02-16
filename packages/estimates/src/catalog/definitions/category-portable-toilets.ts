import type { CatalogCategory } from "@estimates/catalog/types";

export const portableToiletsCategory: CatalogCategory = {
  id: "portable-toilets",
  name: "Portable Toilets",
  subcategories: [
    {
      id: "pt-standard",
      name: "Standard Porta John",
      items: [
        {
          code: "PT-003",
          name: "Standard Porta John (1x/week)",
          description:
            "Weekly cleaning, trash removal, restocking +10% fuel surcharge",
          price: 127,
          unit: "Unit/Month",
        },
        {
          code: "PT-004",
          name: "Standard Porta John (2x/week)",
          description:
            "Twice weekly cleaning, trash removal, restocking +10% fuel surcharge",
          price: 167,
          unit: "Unit/Month",
        },
        {
          code: "PT-005",
          name: "Standard Porta John (3x/week)",
          description:
            "Three times weekly cleaning, trash removal, restocking +10% fuel surcharge",
          price: 197,
          unit: "Unit/Month",
        },
      ],
    },
    {
      id: "pt-handwash",
      name: "Handwash Stations",
      items: [
        {
          code: "PT-006",
          name: "Handwash Station (1x/week)",
          description:
            "Weekly cleaning, restocking, fresh water +10% fuel surcharge",
          price: 200,
          unit: "Unit/Month",
        },
        {
          code: "PT-007",
          name: "Handwash Station (2x/week)",
          description:
            "Twice weekly cleaning, restocking, fresh water +10% fuel surcharge",
          price: 250,
          unit: "Unit/Month",
        },
        {
          code: "PT-008",
          name: "Handwash Station (3x/week)",
          description:
            "Three times weekly cleaning, restocking, fresh water +10% fuel surcharge",
          price: 290,
          unit: "Unit/Month",
        },
      ],
    },
    {
      id: "pt-ada",
      name: "ADA Compliant",
      items: [
        {
          code: "PT-009",
          name: "ADA Porta John (1x/week)",
          description: "ADA compliant, weekly cleaning +10% fuel surcharge",
          price: 200,
          unit: "Unit/Month",
        },
        {
          code: "PT-010",
          name: "ADA Porta John (2x/week)",
          description:
            "ADA compliant, twice weekly cleaning +10% fuel surcharge",
          price: 250,
          unit: "Unit/Month",
        },
        {
          code: "PT-011",
          name: "ADA Porta John (3x/week)",
          description:
            "ADA compliant, three times weekly cleaning +10% fuel surcharge",
          price: 290,
          unit: "Unit/Month",
        },
      ],
    },
    {
      id: "pt-fees",
      name: "Fees & Extras",
      items: [
        {
          code: "PT-001",
          name: "Porta John Delivery/Pickup",
          description:
            "Per unit, charged on install (covers pickup) +10% fuel surcharge",
          price: 50,
          unit: "Each",
        },
        {
          code: "PT-002",
          name: "Porta John Relocation",
          description: "Move unit to new location on site",
          price: 25,
          unit: "Each",
        },
        {
          code: "PT-012",
          name: "Hand Sanitizer",
          description: "Mounted sanitizer dispenser",
          price: 25,
          unit: "Each",
        },
      ],
    },
  ],
};
