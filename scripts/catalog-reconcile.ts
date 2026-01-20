// Catalog reconciliation script - compares catalog.ts with database
import { Database } from "bun:sqlite";
import { catalog } from "../services/quoting/catalog";

const db = new Database("./data/app.db");

// Get all items from catalog.ts
const tsItems = new Map<
  string,
  {
    code: string;
    name: string;
    price: number;
    unit: string;
    category: string;
    subcategory: string | null;
  }
>();

for (const cat of catalog.categories) {
  if (cat.items) {
    for (const item of cat.items) {
      tsItems.set(item.code, {
        code: item.code,
        name: item.name,
        price: item.price,
        unit: item.unit,
        category: cat.name,
        subcategory: null,
      });
    }
  }
  if (cat.subcategories) {
    for (const sub of cat.subcategories) {
      for (const item of sub.items) {
        tsItems.set(item.code, {
          code: item.code,
          name: item.name,
          price: item.price,
          unit: item.unit,
          category: cat.name,
          subcategory: sub.name,
        });
      }
    }
  }
}

// Get all items from database
type DbItem = {
  code: string;
  name: string;
  price: number;
  unit: string;
  description: string | null;
  category: string;
  subcategory: string | null;
};

const dbItems = new Map<string, DbItem>();
const rows = db
  .prepare(
    `
  SELECT i.code, i.name, i.price, i.unit, i.description, c.name as category, s.name as subcategory
  FROM catalog_items i
  LEFT JOIN catalog_categories c ON i.category_id = c.id
  LEFT JOIN catalog_subcategories s ON i.subcategory_id = s.id
`
  )
  .all() as DbItem[];

for (const row of rows) {
  dbItems.set(row.code, row);
}

console.log("=".repeat(80));
console.log("CATALOG RECONCILIATION REPORT");
console.log("=".repeat(80));
console.log("");
console.log("catalog.ts items:", tsItems.size);
console.log("Database items:", dbItems.size);
console.log("");

// 1. Items in catalog.ts but NOT in DB (need to ADD)
console.log("=".repeat(80));
console.log("1. ITEMS TO ADD (in catalog.ts, missing from DB)");
console.log("=".repeat(80));
const toAdd: typeof tsItems extends Map<string, infer V> ? V[] : never = [];
for (const [code, item] of tsItems) {
  if (!dbItems.has(code)) {
    toAdd.push(item);
    console.log(`  ${code} | ${item.name} | $${item.price} | ${item.unit}`);
    console.log(
      `    Category: ${item.category}${item.subcategory ? " > " + item.subcategory : ""}`
    );
  }
}
console.log(`  TOTAL: ${toAdd.length} items to add`);
console.log("");

// 2. Items with differences (need to UPDATE)
console.log("=".repeat(80));
console.log("2. ITEMS TO UPDATE (differences found)");
console.log("=".repeat(80));
const toUpdate: { code: string; tsItem: (typeof toAdd)[0]; dbItem: DbItem }[] =
  [];
for (const [code, tsItem] of tsItems) {
  const dbItem = dbItems.get(code);
  if (dbItem) {
    const priceDiff = Math.abs(tsItem.price - dbItem.price) > 0.001;
    const nameDiff = tsItem.name !== dbItem.name;
    const unitDiff = tsItem.unit !== dbItem.unit;

    if (priceDiff || nameDiff || unitDiff) {
      toUpdate.push({ code, tsItem, dbItem });
      console.log(`  ${code}:`);
      if (nameDiff)
        console.log(`    Name: "${dbItem.name}" -> "${tsItem.name}"`);
      if (priceDiff)
        console.log(`    Price: $${dbItem.price} -> $${tsItem.price}`);
      if (unitDiff) console.log(`    Unit: "${dbItem.unit}" -> "${tsItem.unit}"`);
    }
  }
}
console.log(`  TOTAL: ${toUpdate.length} items to update`);
console.log("");

// 3. Items in DB but NOT in catalog.ts
console.log("=".repeat(80));
console.log("3. ITEMS ONLY IN DATABASE (not in catalog.ts - REVIEW NEEDED)");
console.log("=".repeat(80));
const dbOnly: DbItem[] = [];
for (const [code, item] of dbItems) {
  if (!tsItems.has(code)) {
    dbOnly.push(item);
    console.log(`  ${code} | ${item.name} | $${item.price} | ${item.unit}`);
    console.log(
      `    Category: ${item.category}${item.subcategory ? " > " + item.subcategory : ""}`
    );
  }
}
console.log(`  TOTAL: ${dbOnly.length} items only in DB`);
console.log("");

// Summary
console.log("=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
let matchCount = 0;
for (const [code, tsItem] of tsItems) {
  const dbItem = dbItems.get(code);
  if (dbItem) {
    const priceDiff = Math.abs(tsItem.price - dbItem.price) > 0.001;
    const nameDiff = tsItem.name !== dbItem.name;
    const unitDiff = tsItem.unit !== dbItem.unit;
    if (!priceDiff && !nameDiff && !unitDiff) {
      matchCount++;
    }
  }
}
console.log(`  Items to ADD to DB:       ${toAdd.length}`);
console.log(`  Items to UPDATE in DB:    ${toUpdate.length}`);
console.log(
  `  Items ONLY in DB:         ${dbOnly.length} (need decision: keep or delete?)`
);
console.log(`  Items matching perfectly: ${matchCount}`);

db.close();
