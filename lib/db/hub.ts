/**
 * Hub Database Connection
 *
 * Shared database connection for all hub operations across all apps.
 * All modules should import the db instance from here.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

// Default path is next to this module: lib/db/hub.db
const defaultPath = `${import.meta.dir}/hub.db`;
const dbPath = process.env.HUB_DATABASE_PATH ?? defaultPath;

// Ensure the directory exists (only needed for env override paths)
if (dbPath !== defaultPath) {
  const dbDir = dbPath.slice(0, dbPath.lastIndexOf("/"));
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
