import type { CatalogCategory } from "@/packages/estimates/catalog/types";

export const dustControlMaricopaCategory: CatalogCategory = {
  id: "dust-control-maricopa",
  name: "Maricopa County Dust Control Permits",
  subcategories: [
    {
      id: "dust-permits",
      name: "Permit by Acreage",
      items: [
        {
          code: "DUST-001",
          name: "Maricopa Dust Permit (<1 acre)",
          description: "Includes ADEQ filing & dust control plan preparation.",
          price: 1070,
          unit: "Acre",
          notes: "ADEQ $570 + Admin $500",
        },
        {
          code: "DUST-002",
          name: "Maricopa Dust Permit (1-5 acres)",
          description: "Includes ADEQ filing & dust control plan preparation.",
          price: 1630,
          unit: "Acre",
          notes: "ADEQ $1,130 + Admin $500",
        },
        {
          code: "DUST-003",
          name: "Maricopa Dust Permit (5-10 acres)",
          description:
            "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
          price: 1630,
          unit: "Acre",
          notes: "ADEQ $1,130 + Admin $500",
        },
        {
          code: "DUST-004",
          name: "Maricopa Dust Permit (10-50 acres)",
          description:
            "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
          price: 4870,
          unit: "Acre",
          notes: "ADEQ $4,120 + Admin $750",
        },
        {
          code: "DUST-005",
          name: "Maricopa Dust Permit (50-100 acres)",
          description:
            "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
          price: 7870,
          unit: "Acre",
          notes: "ADEQ $6,870 + Admin $1,000",
        },
        {
          code: "DUST-006",
          name: "Maricopa Dust Permit (100-500 acres)",
          description:
            "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
          price: 11_560,
          unit: "Acre",
          notes: "ADEQ $10,310 + Admin $1,250",
        },
        {
          code: "DUST-007",
          name: "Maricopa Dust Permit (500+ acres)",
          description:
            "Includes ADEQ filing & dust control plan preparation. Signage required for sites over 5 acres.",
          price: 18_490,
          unit: "Acre",
          notes: "ADEQ $16,490 + Admin $2,000",
        },
      ],
    },
    {
      id: "dust-signage",
      name: "Signage",
      items: [
        {
          code: "DUST-008",
          name: "Dust Control sign",
          description:
            "Required for sites over 5 acres. Displays permit number and required contact information.",
          price: 595,
          unit: "Each",
          notes: "Required for sites over 5 acres",
        },
      ],
    },
  ],
};
