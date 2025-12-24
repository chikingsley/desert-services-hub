import type { Database } from "bun:sqlite";
import type { QuoteRow, QuoteStatus } from "./schema";

type SQLValue = string | number | null;

export type QuoteInput = {
  id?: string;
  estimate_number: string;
  revision_number?: number;
  date: string;
  status?: QuoteStatus;
  estimator_id?: string;
  estimator_name?: string;
  estimator_email?: string;
  company_name?: string;
  company_address?: string;
  job_name?: string;
  job_address?: string;
  total?: number;
  line_items?: unknown[];
  sections?: unknown[];
  last_modified_by?: string;
};

export function createQuote(db: Database, input: QuoteInput): QuoteRow {
  const id = input.id || crypto.randomUUID();
  const stmt = db.prepare(`
		INSERT INTO quotes (
			id, estimate_number, revision_number, date, status,
			estimator_id, estimator_name, estimator_email,
			company_name, company_address,
			job_name, job_address,
			total, line_items, sections, last_modified_by
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

  stmt.run(
    id,
    input.estimate_number,
    input.revision_number ?? 1,
    input.date,
    input.status ?? "draft",
    input.estimator_id ?? null,
    input.estimator_name ?? null,
    input.estimator_email ?? null,
    input.company_name ?? null,
    input.company_address ?? null,
    input.job_name ?? null,
    input.job_address ?? null,
    input.total ?? 0,
    input.line_items ? JSON.stringify(input.line_items) : null,
    input.sections ? JSON.stringify(input.sections) : null,
    input.last_modified_by ?? null
  );

  return getQuoteById(db, id)!;
}

export function updateQuote(
  db: Database,
  id: string,
  input: Partial<QuoteInput>
): QuoteRow | null {
  const updates: string[] = [];
  const values: SQLValue[] = [];

  if (input.estimate_number !== undefined) {
    updates.push("estimate_number = ?");
    values.push(input.estimate_number);
  }
  if (input.revision_number !== undefined) {
    updates.push("revision_number = ?");
    values.push(input.revision_number);
  }
  if (input.date !== undefined) {
    updates.push("date = ?");
    values.push(input.date);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status);
  }
  if (input.estimator_id !== undefined) {
    updates.push("estimator_id = ?");
    values.push(input.estimator_id);
  }
  if (input.estimator_name !== undefined) {
    updates.push("estimator_name = ?");
    values.push(input.estimator_name);
  }
  if (input.estimator_email !== undefined) {
    updates.push("estimator_email = ?");
    values.push(input.estimator_email);
  }
  if (input.company_name !== undefined) {
    updates.push("company_name = ?");
    values.push(input.company_name);
  }
  if (input.company_address !== undefined) {
    updates.push("company_address = ?");
    values.push(input.company_address);
  }
  if (input.job_name !== undefined) {
    updates.push("job_name = ?");
    values.push(input.job_name);
  }
  if (input.job_address !== undefined) {
    updates.push("job_address = ?");
    values.push(input.job_address);
  }
  if (input.total !== undefined) {
    updates.push("total = ?");
    values.push(input.total);
  }
  if (input.line_items !== undefined) {
    updates.push("line_items = ?");
    values.push(JSON.stringify(input.line_items));
  }
  if (input.sections !== undefined) {
    updates.push("sections = ?");
    values.push(JSON.stringify(input.sections));
  }
  if (input.last_modified_by !== undefined) {
    updates.push("last_modified_by = ?");
    values.push(input.last_modified_by);
  }

  if (updates.length === 0) {
    return getQuoteById(db, id);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const stmt = db.prepare(
    `UPDATE quotes SET ${updates.join(", ")} WHERE id = ?`
  );
  stmt.run(...values);

  return getQuoteById(db, id);
}

export function getQuoteById(db: Database, id: string): QuoteRow | null {
  const stmt = db.prepare("SELECT * FROM quotes WHERE id = ?");
  return stmt.get(id) as QuoteRow | null;
}

export function getQuoteByEstimateNumber(
  db: Database,
  estimateNumber: string
): QuoteRow | null {
  const stmt = db.prepare("SELECT * FROM quotes WHERE estimate_number = ?");
  return stmt.get(estimateNumber) as QuoteRow | null;
}

export type QuoteListOptions = {
  search?: string;
  status?: QuoteStatus;
  company?: string;
  limit?: number;
  offset?: number;
  orderBy?: "date" | "estimate_number" | "company_name" | "total";
  orderDir?: "asc" | "desc";
};

export function listQuotes(
  db: Database,
  options: QuoteListOptions = {}
): { quotes: QuoteRow[]; total: number } {
  const conditions: string[] = [];
  const values: SQLValue[] = [];

  if (options.search) {
    conditions.push(
      "(estimate_number LIKE ? OR company_name LIKE ? OR job_name LIKE ?)"
    );
    const searchTerm = `%${options.search}%`;
    values.push(searchTerm, searchTerm, searchTerm);
  }

  if (options.status) {
    conditions.push("status = ?");
    values.push(options.status);
  }

  if (options.company) {
    conditions.push("company_name = ?");
    values.push(options.company);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countStmt = db.prepare(
    `SELECT COUNT(*) as count FROM quotes ${whereClause}`
  );
  const { count } = countStmt.get(...values) as { count: number };

  // Get paginated results
  const orderBy = options.orderBy || "date";
  const orderDir = options.orderDir || "desc";
  const limit = options.limit || 25;
  const offset = options.offset || 0;

  const stmt = db.prepare(`
		SELECT * FROM quotes
		${whereClause}
		ORDER BY ${orderBy} ${orderDir}
		LIMIT ? OFFSET ?
	`);

  const paginatedValues: SQLValue[] = [...values, limit, offset];
  const quotes = stmt.all(...paginatedValues) as QuoteRow[];

  return { quotes, total: count };
}

export function deleteQuote(db: Database, id: string): boolean {
  const stmt = db.prepare("DELETE FROM quotes WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getUniqueCompanies(db: Database): string[] {
  const stmt = db.prepare(
    "SELECT DISTINCT company_name FROM quotes WHERE company_name IS NOT NULL ORDER BY company_name"
  );
  return (stmt.all() as { company_name: string }[]).map((r) => r.company_name);
}
