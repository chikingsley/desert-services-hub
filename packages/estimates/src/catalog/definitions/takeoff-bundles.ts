import type { TakeoffBundle } from "@estimates/catalog/types";

export const takeoffBundlesData: TakeoffBundle[] = [
  {
    id: "bundle-temp-fencing",
    name: "Temporary Fencing",
    description:
      "Chain-link fence installation - measures linear feet and creates Install, Rental, and optional add-ons",
    unit: "LF",
    toolType: "linear",
    color: "#f97316",
    items: [
      {
        code: "TF-001",
        isRequired: true,
        quantityMultiplier: 1,
      },
      {
        code: "TF-002",
        isRequired: true,
        quantityMultiplier: 1,
      },
      {
        code: "TF-003",
        isRequired: false,
        quantityMultiplier: 1,
      },
      {
        code: "TF-005",
        isRequired: false,
        quantityMultiplier: 1,
      },
    ],
  },
  {
    id: "bundle-silt-fence",
    name: "Silt Fence",
    description: "Wire-backed silt fence installation - measures linear feet",
    unit: "LF",
    toolType: "linear",
    color: "#84cc16",
    items: [
      {
        code: "CM-004",
        isRequired: true,
        quantityMultiplier: 1,
      },
    ],
  },
  {
    id: "bundle-filter-sock",
    name: "Compost Filter Sock",
    description:
      "9-inch compost filter sock installation - measures linear feet",
    unit: "LF",
    toolType: "linear",
    color: "#a855f7",
    items: [
      {
        code: "CM-003",
        isRequired: true,
        quantityMultiplier: 1,
      },
    ],
  },
  {
    id: "bundle-drop-inlet",
    name: "Drop Inlet Protection",
    description: "Storm drain inlet protection - count each inlet",
    unit: "Each",
    toolType: "count",
    color: "#3b82f6",
    items: [
      {
        code: "CM-005",
        isRequired: true,
        quantityMultiplier: 1,
      },
    ],
  },
  {
    id: "bundle-curb-inlet",
    name: "Curb Inlet Protection",
    description: "Curb-style drain inlet protection - count each inlet",
    unit: "Each",
    toolType: "count",
    color: "#06b6d4",
    items: [
      {
        code: "CM-006",
        isRequired: true,
        quantityMultiplier: 1,
      },
    ],
  },
  {
    id: "bundle-rock-entrance",
    name: "Rock Entrance",
    description: "Stabilized construction entrance - count each entrance",
    unit: "Each",
    toolType: "count",
    color: "#78716c",
    items: [
      {
        code: "CM-001",
        isRequired: true,
        quantityMultiplier: 1,
      },
    ],
  },
];
