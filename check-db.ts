import { Database } from "bun:sqlite";

const dbPath =
  "/Users/chiejimofor/Documents/Github/desert-services-hub/apps/contract-ui/contract/census/census.db";

const db = new Database(dbPath, { readonly: true });

console.log("=== ALL TABLES ===");
const tables = db
  .query("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log(JSON.stringify(tables, null, 2));

console.log("\n=== ESTIMATES TABLE SCHEMA ===");
const schema = db.query("PRAGMA table_info(estimates)").all();
console.log(JSON.stringify(schema, null, 2));

console.log("\n=== SAMPLE DATA FROM ESTIMATES ===");
const sample = db.query("SELECT * FROM estimates LIMIT 5").all();
console.log(JSON.stringify(sample, null, 2));

db.close();
