/**
 * Census Database Connection
 *
 * Single database connection for all census operations.
 * All modules should import the db instance from here.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Default path is next to the db/ folder (in census/)
const defaultPath = join(import.meta.dir, "..", "census.db");
const dbPath = process.env.CENSUS_DATABASE_PATH ?? defaultPath;

// Ensure the directory exists
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create the single database instance
export const db = new Database(dbPath, { create: true });

// Enable WAL mode for better performance
db.run("PRAGMA journal_mode = WAL");

// Enable foreign key constraints
db.run("PRAGMA foreign_keys = ON");

// Wait up to 30s for locks (handles concurrent access better)
db.run("PRAGMA busy_timeout = 30000");

// Export the path for debugging/logging
export const databasePath = dbPath;
