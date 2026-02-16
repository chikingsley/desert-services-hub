import type { CatalogCategory } from "@estimates/catalog/types";

export const tempFencingCategory: CatalogCategory = {
  id: "temp-fencing",
  name: "Temporary Fencing",
  subcategories: [
    {
      id: "tf-service",
      name: "Installation & Rental",
      items: [
        {
          code: "TF-001",
          name: "Fence Install",
          description:
            "Chain-link panel installation with driven posts or weighted stands with one swing gate",
          price: 1.75,
          unit: "LF",
          notes: "Trip charge not included",
        },
        {
          code: "TF-002",
          name: "Fence Rental (Monthly)",
          description:
            "6' chain-link panel rental billed per linear foot monthly ($100 min)",
          price: 0.3,
          unit: "LF/Month",
        },
        {
          code: "TF-003",
          name: "Privacy Screen",
          description:
            "HDPE mesh screen attached to fence panels with 85% opacity for privacy & dust control",
          price: 2.9,
          unit: "LF",
          notes: "Tax additional",
        },
        {
          code: "TF-005",
          name: "Fencing Trip Charge",
          description:
            "Service call for fence installation, relocations, or repairs",
          price: 285,
          unit: "Each",
        },
      ],
    },
    {
      id: "tf-replacement",
      name: "Replacement Parts",
      items: [
        {
          code: "TF-004",
          name: "Fence Stand Sandbags",
          description: "Per sandbag, delivered and installed",
          price: 7.5,
          unit: "Each",
        },
        {
          code: "TF-006",
          name: "Fence Panel",
          description: "Replacement panel",
          price: 125,
          unit: "Each",
        },
        {
          code: "TF-007",
          name: "Fence Pole",
          description: "Replacement pole",
          price: 25,
          unit: "Each",
        },
        {
          code: "TF-008",
          name: "Fence Stand",
          description: "Replacement stand",
          price: 25,
          unit: "Each",
        },
        {
          code: "TF-009",
          name: "Fence Bracket",
          description: "Replacement bracket",
          price: 5,
          unit: "Each",
        },
      ],
    },
  ],
};
