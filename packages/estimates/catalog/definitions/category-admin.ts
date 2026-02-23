import type { CatalogCategory } from "@/packages/estimates/catalog/types";

export const adminCategory: CatalogCategory = {
  id: "admin",
  name: "Administrative & Fees",
  items: [
    {
      code: "ADMIN-001",
      name: "Mobilization / Trip Charge",
      description:
        "Standard trip charge for crew dispatch covering BMP install, repair, or site visits",
      price: 265,
      unit: "Each",
    },
    {
      code: "ADMIN-002",
      name: "CCIP/OCIP/Insurance Portal",
      description:
        "Administration and documentation for wrap-up insurance enrollment & contractor portal compliance",
      price: 250,
      unit: "Each",
    },
    {
      code: "ADMIN-003",
      name: "Textura Setup",
      description:
        "One-time setup for Oracle Textura payment management system with vendor onboarding",
      price: 100,
      unit: "Each",
    },
    {
      code: "ADMIN-004",
      name: "Textura/Procore Processing",
      description:
        "Monthly processing fee for Textura or Procore billing with lien waiver management",
      price: 100,
      unit: "Each",
    },
  ],
};
