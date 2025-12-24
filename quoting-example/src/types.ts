export type LineItem = {
  id: string;
  item: string;
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
  subcategoryId?: string;
  isStruck?: boolean;
};

export type TierDefinition = {
  min: number;
  max: number;
  price: number;
  label: string;
  adeqFee: number;
  filingFee: number;
};

// Dust permit tier configuration with ADEQ and filing fee breakdown
export const DUST_PERMIT_TIERS: TierDefinition[] = [
  {
    min: 0.1,
    max: 0.99,
    price: 1070,
    label: "0.1 - 0.9 acres",
    adeqFee: 570,
    filingFee: 500,
  },
  {
    min: 1,
    max: 4.99,
    price: 1630,
    label: "1 - 4.99 acres",
    adeqFee: 1130,
    filingFee: 500,
  },
  {
    min: 5,
    max: 9.99,
    price: 1630,
    label: "5 - 9.99 acres",
    adeqFee: 1130,
    filingFee: 500,
  },
  {
    min: 10,
    max: 49,
    price: 4870,
    label: "10 - 49 acres",
    adeqFee: 4120,
    filingFee: 750,
  },
  {
    min: 50,
    max: 99,
    price: 7620,
    label: "50 - 99 acres",
    adeqFee: 6870,
    filingFee: 750,
  },
  {
    min: 100,
    max: 499,
    price: 11_060,
    label: "100 - 499 acres",
    adeqFee: 10_310,
    filingFee: 750,
  },
  {
    min: 500,
    max: Number.POSITIVE_INFINITY,
    price: 17_240,
    label: "500+ acres",
    adeqFee: 16_490,
    filingFee: 750,
  },
];

// Quote versioning for amendments
export type QuoteStatus = "draft" | "sent" | "locked" | "amended";

export type QuoteVersion = {
  version: number;
  status: QuoteStatus;
  createdAt: string;
  lockedAt?: string;
  snapshot: Quote;
  changes?: ChangeRecord[];
};

export type ChangeRecord = {
  type: "added" | "removed" | "modified";
  lineItemId: string;
  field?: keyof LineItem;
  previousValue?: unknown;
  newValue?: unknown;
  timestamp: string;
};

// Extended Quote type with versioning
export interface VersionedQuote extends Quote {
  status: QuoteStatus;
  currentVersion: number;
  versions: QuoteVersion[];
}

export type QuoteSection = {
  id: string;
  name: string;
  showSubtotal?: boolean;
};

export type Quote = {
  estimateNumber: string;
  date: string;
  estimator: string;
  estimatorEmail: string;
  billTo: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
  };
  jobInfo: {
    siteName: string;
    address: string;
  };
  sections: QuoteSection[];
  lineItems: LineItem[];
  total: number;
};

// Selection mode for categories/subcategories
export type SelectionMode = "pick-one" | "pick-many";

export type CatalogItem = {
  code: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  notes?: string;
  defaultQty?: number;
};

export type CatalogSubcategory = {
  id: string;
  name: string;
  selectionMode?: SelectionMode;
  items: CatalogItem[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  selectionMode?: SelectionMode;
  items?: CatalogItem[];
  subcategories?: CatalogSubcategory[];
};

export type Catalog = {
  categories: CatalogCategory[];
};

// Helper to get all items from a category (flat list)
export function getAllCategoryItems(category: CatalogCategory): CatalogItem[] {
  const items: CatalogItem[] = [];
  if (category.items) {
    items.push(...category.items);
  }
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      items.push(...sub.items);
    }
  }
  return items;
}

// Helper to find an item by code in a category
export function findItemInCategory(
  category: CatalogCategory,
  code: string
): { item: CatalogItem; subcategory?: CatalogSubcategory } | null {
  if (category.items) {
    const item = category.items.find((i) => i.code === code);
    if (item) {
      return { item };
    }
  }
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      const item = sub.items.find((i) => i.code === code);
      if (item) {
        return { item, subcategory: sub };
      }
    }
  }
  return null;
}
