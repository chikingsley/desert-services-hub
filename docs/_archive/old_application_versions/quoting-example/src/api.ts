const API_BASE = "http://localhost:3001";

export type QuoteRow = {
  id: string;
  estimate_number: string;
  revision_number: number;
  date: string;
  status: "draft" | "sent" | "accepted" | "declined";
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
};

export type Contractor = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
};

export type Employee = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
};

export type QuoteListResponse = {
  quotes: QuoteRow[];
  total: number;
};

export type QuoteListParams = {
  search?: string;
  status?: string;
  company?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: string;
};

// Quotes API
export async function fetchQuotes(
  params: QuoteListParams = {}
): Promise<QuoteListResponse> {
  const searchParams = new URLSearchParams();
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.company) {
    searchParams.set("company", params.company);
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset) {
    searchParams.set("offset", String(params.offset));
  }
  if (params.orderBy) {
    searchParams.set("orderBy", params.orderBy);
  }
  if (params.orderDir) {
    searchParams.set("orderDir", params.orderDir);
  }

  const res = await fetch(`${API_BASE}/api/quotes?${searchParams}`);
  if (!res.ok) {
    throw new Error("Failed to fetch quotes");
  }
  return res.json();
}

export async function fetchQuote(id: string): Promise<QuoteRow> {
  const res = await fetch(`${API_BASE}/api/quotes/${id}`);
  if (!res.ok) {
    throw new Error("Failed to fetch quote");
  }
  return res.json();
}

export type QuoteInput = {
  estimate_number?: string;
  revision_number?: number;
  date?: string;
  status?: "draft" | "sent" | "accepted" | "declined";
  estimator_id?: string | null;
  estimator_name?: string | null;
  estimator_email?: string | null;
  company_name?: string | null;
  company_address?: string | null;
  job_name?: string | null;
  job_address?: string | null;
  total?: number;
  line_items?: unknown[];
  sections?: unknown[];
};

export async function createQuote(input: QuoteInput): Promise<QuoteRow> {
  const res = await fetch(`${API_BASE}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error("Failed to create quote");
  }
  return res.json();
}

export async function updateQuote(
  id: string,
  input: QuoteInput
): Promise<QuoteRow> {
  const res = await fetch(`${API_BASE}/api/quotes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error("Failed to update quote");
  }
  return res.json();
}

export async function deleteQuote(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/quotes/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Failed to delete quote");
  }
}

// Contractors API
export async function fetchContractors(
  search = "",
  limit = 20
): Promise<Contractor[]> {
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  params.set("limit", String(limit));

  const res = await fetch(`${API_BASE}/api/contractors?${params}`);
  if (!res.ok) {
    throw new Error("Failed to fetch contractors");
  }
  return res.json();
}

// Employees API
export async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch(`${API_BASE}/api/employees`);
  if (!res.ok) {
    throw new Error("Failed to fetch employees");
  }
  return res.json();
}

// Create Contractor
export type ContractorInput = {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
};

export async function createContractor(
  input: ContractorInput
): Promise<Contractor> {
  const res = await fetch(`${API_BASE}/api/contractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error("Failed to create contractor");
  }
  return res.json();
}
