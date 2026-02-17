import { findItem } from "@estimates/catalog/catalog";
import type { Content, TableCell } from "pdfmake/interfaces";
import { COMPANY } from "../shared/brand";
import { borderedLayout, noBordersLayout } from "../shared/layouts";

interface BackPageServiceItem {
  label: string;
  catalogCode: string;
  pricePrefix?: string;
  priceSuffix?: string;
}

interface BackPageService {
  title: string;
  items: BackPageServiceItem[];
  note?: string;
}

const BACK_PAGE_SERVICES: BackPageService[] = [
  {
    title: "SWPPP / Stormwater",
    items: [
      {
        label: "SWPPP Plans & Narratives",
        catalogCode: "SWPPP-002",
        pricePrefix: "from",
      },
      {
        label: "14-Day Inspections",
        catalogCode: "SWPPP-005",
        pricePrefix: "from",
      },
      {
        label: "BMP Installation & Repair",
        catalogCode: "ADMIN-001",
        pricePrefix: "from",
      },
    ],
    note: "Full compliance services available",
  },
  {
    title: "Dust Permits",
    items: [
      {
        label: "Permit Filing (<1 acre)",
        catalogCode: "DUST-001",
        pricePrefix: "from",
      },
      {
        label: "Permit Filing (1-5 acres)",
        catalogCode: "DUST-002",
        pricePrefix: "from",
      },
      { label: "Dust Control Sign (5+ acres)", catalogCode: "DUST-008" },
    ],
    note: "Includes ADEQ filing fees",
  },
  {
    title: "Water Trucks",
    items: [
      {
        label: "Water Truck w/ Operator",
        catalogCode: "WT-001",
        priceSuffix: "/hr",
      },
      {
        label: "Soil Stabilization",
        catalogCode: "WT-002",
        pricePrefix: "from",
        priceSuffix: "/acre",
      },
    ],
    note: "2 hr minimum. +10% fuel surcharge",
  },
  {
    title: "Portable Toilets",
    items: [
      { label: "Standard (1x/wk)", catalogCode: "PT-003", priceSuffix: "/mo" },
      {
        label: "ADA Compliant (1x/wk)",
        catalogCode: "PT-009",
        priceSuffix: "/mo",
      },
      {
        label: "Handwash Station",
        catalogCode: "PT-006",
        pricePrefix: "from",
        priceSuffix: "/mo",
      },
    ],
    note: "+10% fuel surcharge",
  },
  {
    title: "Roll-Off Dumpsters",
    items: [
      {
        label: "10 yd (2 tons incl)",
        catalogCode: "RO-009",
        pricePrefix: "from",
      },
      {
        label: "20 yd (2 tons incl)",
        catalogCode: "RO-002",
        pricePrefix: "from",
      },
      {
        label: "30 yd (3 tons incl)",
        catalogCode: "RO-003",
        pricePrefix: "from",
      },
      {
        label: "40 yd (4 tons incl)",
        catalogCode: "RO-004",
        pricePrefix: "from",
      },
    ],
    note: "+10% fuel surcharge. Overage $65/ton",
  },
  {
    title: "Compliance Signs",
    items: [
      { label: "SWPPP Sign", catalogCode: "CM-013" },
      { label: "Fire Access Sign", catalogCode: "CM-014" },
      { label: "Dust Control Sign", catalogCode: "DUST-008" },
    ],
  },
  {
    title: "Street Sweeping",
    items: [
      {
        label: "Street Sweeper w/ Operator",
        catalogCode: "SS-001",
        priceSuffix: "/hr",
      },
    ],
    note: "2 hr minimum. +10% fuel surcharge",
  },
  {
    title: "Pressure Washing",
    items: [
      { label: "Regular Hours", catalogCode: "PW-001", priceSuffix: "/hr" },
      { label: "After Hours", catalogCode: "PW-002", priceSuffix: "/hr" },
      { label: "Auto Scrubber", catalogCode: "PW-003", priceSuffix: "/hr" },
    ],
    note: "2 hr minimum. +10% fuel surcharge",
  },
  {
    title: "Temporary Fencing",
    items: [
      { label: "Install/Remove", catalogCode: "TF-001", priceSuffix: "/LF" },
      { label: "Monthly Rental", catalogCode: "TF-002", priceSuffix: "/LF/mo" },
      { label: "Privacy Screen", catalogCode: "TF-003", priceSuffix: "/LF" },
    ],
    note: "Trip charge additional",
  },
  {
    title: "Tanks & Waste Service",
    items: [
      { label: "Full Tank System Install", catalogCode: "TANK-001" },
      {
        label: "Weekly Service (waste)",
        catalogCode: "TANK-003",
        priceSuffix: "/mo",
      },
      {
        label: "Weekly Service (full)",
        catalogCode: "TANK-005",
        priceSuffix: "/mo",
      },
    ],
  },
];

function getCatalogPrice(code: string): number | null {
  const item = findItem(code);
  return item?.price ?? null;
}

function formatBackPagePrice(
  catalogCode: string,
  pricePrefix?: string,
  priceSuffix?: string
): string {
  const price = getCatalogPrice(catalogCode);
  if (price === null) {
    return "";
  }

  const formattedPrice =
    price < 10
      ? `$${price.toFixed(2)}`
      : `$${Math.round(price).toLocaleString()}`;

  const prefix = pricePrefix ? `${pricePrefix} ` : "";
  const suffix = priceSuffix ?? "";

  return `${prefix}${formattedPrice}${suffix}`;
}

function buildServiceBox(service: BackPageService): Content {
  const itemRows: Content[] = service.items.map((item) => ({
    columns: [
      { text: item.label, fontSize: 8, width: "*" },
      {
        text: formatBackPagePrice(
          item.catalogCode,
          item.pricePrefix,
          item.priceSuffix
        ),
        fontSize: 8,
        alignment: "right" as const,
        width: "auto",
        bold: true,
      },
    ],
    margin: [0, 1, 0, 1] as [number, number, number, number],
  }));

  const stack: Content[] = [
    {
      text: service.title,
      fontSize: 10,
      bold: true,
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    ...itemRows,
  ];

  if (service.note) {
    stack.push({
      text: service.note,
      fontSize: 7,
      italics: true,
      color: "#666",
      margin: [0, 4, 0, 0] as [number, number, number, number],
    });
  }

  return {
    stack,
    margin: [8, 8, 8, 8] as [number, number, number, number],
  };
}

export function buildEstimateBackPageContent(logoBase64: string): Content[] {
  const rows: Content[] = [];

  for (let i = 0; i < BACK_PAGE_SERVICES.length; i += 2) {
    const leftService = BACK_PAGE_SERVICES[i];
    const rightService = BACK_PAGE_SERVICES[i + 1];

    if (!leftService) {
      continue;
    }

    const tableBody: TableCell[][] = [
      [
        buildServiceBox(leftService),
        rightService ? buildServiceBox(rightService) : { text: "" },
      ],
    ];

    rows.push({
      table: {
        widths: ["50%", "50%"],
        body: tableBody,
      },
      layout: borderedLayout,
      margin: [0, 0, 0, 0] as [number, number, number, number],
    });
  }

  return [
    {
      columns: [
        {
          image: logoBase64,
          fit: [200, 45],
          width: "auto",
        },
        {
          stack: [
            {
              text: "Desert Services",
              fontSize: 22,
              bold: true,
              alignment: "right",
            },
            {
              text: "Full-Service Construction Support",
              fontSize: 11,
              alignment: "right",
              color: "#666",
            },
          ],
          width: "*",
        },
      ],
      margin: [0, 0, 0, 15],
    } as Content,

    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: `Call for pricing: ${COMPANY.phone}`,
              fontSize: 14,
              bold: true,
              alignment: "center" as const,
              fillColor: "#000",
              color: "#fff",
              margin: [0, 8, 0, 8] as [number, number, number, number],
            },
          ],
        ],
      },
      layout: noBordersLayout,
      margin: [0, 0, 0, 15] as [number, number, number, number],
    },

    ...rows,

    {
      stack: [
        {
          text: "2026 Pricing • Subject to change • +10% fuel surcharge applies to most services",
          fontSize: 8,
          alignment: "center" as const,
          margin: [0, 15, 0, 2] as [number, number, number, number],
        },
        {
          text: `Sales tax additional where applicable • ROC #${COMPANY.roc}`,
          fontSize: 8,
          alignment: "center" as const,
          color: "#666",
        },
      ],
    },
  ];
}
