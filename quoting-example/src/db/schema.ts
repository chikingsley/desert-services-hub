import { Database } from "bun:sqlite";

const DB_PATH = "./data/quotes.db";

export function initDatabase(): Database {
  const db = new Database(DB_PATH, { create: true });

  // Enable WAL mode for better concurrent access
  db.run("PRAGMA journal_mode = WAL");

  // Create tables
  db.run(`
		CREATE TABLE IF NOT EXISTS employees (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT,
			phone TEXT,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`);

  db.run(`
		CREATE TABLE IF NOT EXISTS contractors (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			address TEXT,
			email TEXT,
			phone TEXT,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`);

  db.run(`
		CREATE TABLE IF NOT EXISTS quotes (
			id TEXT PRIMARY KEY,
			estimate_number TEXT UNIQUE NOT NULL,
			revision_number INTEGER DEFAULT 1,
			date TEXT NOT NULL,
			status TEXT DEFAULT 'draft',
			
			estimator_id TEXT,
			estimator_name TEXT,
			estimator_email TEXT,
			
			company_name TEXT,
			company_address TEXT,
			
			job_name TEXT,
			job_address TEXT,
			
			total REAL DEFAULT 0,
			line_items TEXT,
			sections TEXT,
			
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
			last_modified_by TEXT,
			
			FOREIGN KEY (estimator_id) REFERENCES employees(id)
		)
	`);

  // Create indexes for common queries
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_quotes_estimate_number ON quotes(estimate_number)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_quotes_company_name ON quotes(company_name)"
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)");

  return db;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export type QuoteRow = {
  id: string;
  estimate_number: string;
  revision_number: number;
  date: string;
  status: QuoteStatus;
  estimator_id: string | null;
  estimator_name: string | null;
  estimator_email: string | null;
  company_name: string | null;
  company_address: string | null;
  job_name: string | null;
  job_address: string | null;
  total: number;
  line_items: string | null;
  sections: string | null;
  created_at: string;
  updated_at: string;
  last_modified_by: string | null;
};

export type EmployeeRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export type ContractorRow = {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};
