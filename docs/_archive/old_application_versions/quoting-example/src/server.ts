import { Database } from "bun:sqlite";
import type { QuoteInput, QuoteListOptions } from "./db/quotes";
import type { QuoteStatus } from "./db/schema";

// Types for notion-sync.db queries
type NotionContractor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type LocalContractor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

import {
  createQuote,
  deleteQuote,
  getQuoteByEstimateNumber,
  getQuoteById,
  getUniqueCompanies,
  listQuotes,
  updateQuote,
} from "./db/quotes";
import { initDatabase } from "./db/schema";

// Initialize our quotes database
const quotesDb = initDatabase();

// Use the existing notion-sync.db for contractors and employees
const notionDb = new Database("./notion-sync.db", { readonly: true });

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Helper to create JSON response
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

// API Routes
const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- QUOTES ---

    // GET /api/quotes - List quotes with filters
    if (path === "/api/quotes" && req.method === "GET") {
      const search = url.searchParams.get("search") || undefined;
      const statusParam = url.searchParams.get("status");
      const status = (
        ["draft", "sent", "accepted", "declined"].includes(statusParam || "")
          ? statusParam
          : undefined
      ) as QuoteStatus | undefined;
      const company = url.searchParams.get("company") || undefined;
      const limit = Number(url.searchParams.get("limit")) || 25;
      const offset = Number(url.searchParams.get("offset")) || 0;
      const orderByParam = url.searchParams.get("orderBy");
      const orderBy = (
        ["date", "estimate_number", "company_name", "total"].includes(
          orderByParam || ""
        )
          ? orderByParam
          : "date"
      ) as QuoteListOptions["orderBy"];
      const orderDirParam = url.searchParams.get("orderDir");
      const orderDir = (
        ["asc", "desc"].includes(orderDirParam || "") ? orderDirParam : "desc"
      ) as QuoteListOptions["orderDir"];

      const result = listQuotes(quotesDb, {
        search,
        status,
        company,
        limit,
        offset,
        orderBy,
        orderDir,
      });
      return json(result);
    }

    // GET /api/quotes/:id - Get single quote
    if (path.startsWith("/api/quotes/") && req.method === "GET") {
      const id = path.split("/")[3];
      const quote = getQuoteById(quotesDb, id);
      if (!quote) {
        return json({ error: "Quote not found" }, 404);
      }
      return json(quote);
    }

    // POST /api/quotes - Create quote (or return existing if estimate_number exists)
    if (path === "/api/quotes" && req.method === "POST") {
      const input = (await req.json()) as QuoteInput;

      // Check if quote with this estimate number already exists
      if (input.estimate_number) {
        const existing = getQuoteByEstimateNumber(
          quotesDb,
          input.estimate_number
        );
        if (existing) {
          // Update existing quote instead of creating duplicate
          const updated = updateQuote(quotesDb, existing.id, input);
          return json(updated, 200);
        }
      }

      const quote = createQuote(quotesDb, input);
      return json(quote, 201);
    }

    // PUT /api/quotes/:id - Update quote
    if (path.startsWith("/api/quotes/") && req.method === "PUT") {
      const id = path.split("/")[3];
      const input = (await req.json()) as Partial<QuoteInput>;
      const quote = updateQuote(quotesDb, id, input);
      if (!quote) {
        return json({ error: "Quote not found" }, 404);
      }
      return json(quote);
    }

    // DELETE /api/quotes/:id - Delete quote
    if (path.startsWith("/api/quotes/") && req.method === "DELETE") {
      const id = path.split("/")[3];
      const success = deleteQuote(quotesDb, id);
      if (!success) {
        return json({ error: "Quote not found" }, 404);
      }
      return json({ success: true });
    }

    // GET /api/quotes/companies - Get unique companies from quotes
    if (path === "/api/quotes/companies" && req.method === "GET") {
      const companies = getUniqueCompanies(quotesDb);
      return json(companies);
    }

    // --- CONTRACTORS (merged from notion-sync.db + local quotes.db) ---

    // GET /api/contractors - Search contractors/accounts
    if (path === "/api/contractors" && req.method === "GET") {
      const search = url.searchParams.get("search") || "";
      const limit = Number(url.searchParams.get("limit")) || 20;

      // Query notion-sync.db (synced from Notion)
      let notionContractors: NotionContractor[] = [];
      try {
        if (search) {
          const stmt = notionDb.prepare(`
						SELECT id, name, billing_email as email, billing_phone as phone
						FROM accounts
						WHERE name LIKE ?
						ORDER BY name
						LIMIT ?
					`);
          notionContractors = stmt.all(
            `%${search}%`,
            limit
          ) as NotionContractor[];
        } else {
          const stmt = notionDb.prepare(`
						SELECT id, name, billing_email as email, billing_phone as phone
						FROM accounts
						ORDER BY name
						LIMIT ?
					`);
          notionContractors = stmt.all(limit) as NotionContractor[];
        }
      } catch (e) {
        console.error("Error querying notion-sync.db:", e);
      }

      // Query local quotes.db for user-created contractors
      let localContractors: LocalContractor[] = [];
      try {
        if (search) {
          const stmt = quotesDb.prepare(`
						SELECT id, name, email, phone, address
						FROM contractors
						WHERE name LIKE ?
						ORDER BY name
						LIMIT ?
					`);
          localContractors = stmt.all(
            `%${search}%`,
            limit
          ) as LocalContractor[];
        } else {
          const stmt = quotesDb.prepare(`
						SELECT id, name, email, phone, address
						FROM contractors
						ORDER BY name
						LIMIT ?
					`);
          localContractors = stmt.all(limit) as LocalContractor[];
        }
      } catch (e) {
        console.error("Error querying local contractors:", e);
      }

      // Merge results, local first (user-created), then notion
      const merged = [...localContractors, ...notionContractors].slice(
        0,
        limit
      );
      return json(merged);
    }

    // POST /api/contractors - Create new contractor (saved to local quotes.db)
    if (path === "/api/contractors" && req.method === "POST") {
      const input = (await req.json()) as {
        name: string;
        address?: string;
        email?: string;
        phone?: string;
      };

      if (!input.name?.trim()) {
        return json({ error: "Name is required" }, 400);
      }

      const id = crypto.randomUUID();
      const stmt = quotesDb.prepare(`
				INSERT INTO contractors (id, name, address, email, phone)
				VALUES (?, ?, ?, ?, ?)
			`);
      stmt.run(
        id,
        input.name.trim(),
        input.address || null,
        input.email || null,
        input.phone || null
      );

      const created = quotesDb
        .prepare("SELECT * FROM contractors WHERE id = ?")
        .get(id);
      return json(created, 201);
    }

    // GET /api/contractors/:id - Get single contractor
    if (path.startsWith("/api/contractors/") && req.method === "GET") {
      const id = path.split("/")[3];
      const stmt = notionDb.prepare(`
				SELECT id, name, billing_email as email, billing_phone as phone
				FROM accounts
				WHERE id = ?
			`);
      const contractor = stmt.get(id);
      if (!contractor) {
        return json({ error: "Contractor not found" }, 404);
      }
      return json(contractor);
    }

    // --- EMPLOYEES (desert services staff from notion-sync.db) ---

    // GET /api/employees - Get Desert Services employees
    if (path === "/api/employees" && req.method === "GET") {
      const stmt = notionDb.prepare(`
				SELECT 
					id,
					first_name || ' ' || COALESCE(last_name, '') as name,
					email,
					phone,
					title
				FROM contacts
				WHERE email LIKE '%desertservices.net'
				AND first_name IS NOT NULL
				AND first_name != ''
				ORDER BY first_name
			`);
      const employees = stmt.all();
      return json(employees);
    }

    // 404 for unknown routes
    return json({ error: "Not found" }, 404);
  },
});

console.log(`API server running at http://localhost:${server.port}`);
