/**
 * Contact Linking — 3-layer system
 *
 * Layer 1: Deterministic — match from/to/cc email addresses against contacts.email
 *          Populates contact_emails join table.
 * Layer 2: Creation — create new contacts for unmatched external email senders.
 *          Uses synthetic monday_item_id = 'email:{sha1[:16]}' (no Monday ID).
 * Layer 3: Enrichment — extract phone/title from email signatures via granite4 (local LLM).
 *
 * All writes are idempotent (ON CONFLICT DO NOTHING / DO UPDATE).
 * Safe to call repeatedly.
 */
import { createHash } from "node:crypto";
import { db } from "@lib/db/hub";

// ── Types ────────────────────────────────────────────────────────────

export interface ContactLinkStats {
  linkedFrom: number;
  linkedTo: number;
  linkedCc: number;
  contactsCreated: number;
  contactsEnriched: number;
  enrichmentErrors: number;
}

interface UnmatchedSender {
  email: string;
  name: string | null;
  account_id: number;
}

interface ContactForEnrichment {
  id: number;
  email: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────────

const OLLAMA_BASE_URL =
  process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.LOCAL_LLM_MODEL ?? "granite4:latest";

/** Domains that should never create contacts (platform relays, noreply, generic) */
const SKIP_SENDER_DOMAINS = new Set([
  "buildingconnected.com",
  "procore.com",
  "procoretech.com",
  "us02.procoretech.com",
  "bbbid.thebluebook.com",
  "thebluebook.com",
  "bidmail.com",
  "pype.io",
  "planhub.com",
  "message.planhub.com",
  "smartbidnet.com",
  "com2.smartbidnet.com",
  "avanan-mail.net",
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
]);

const SKIP_NAME_RE =
  /^(noreply|no-?reply|notifications?|mailer-daemon|postmaster)$|via\s+(procore|buildingconnected|planhub|smartbid)/i;

const MARKDOWN_JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;
const LOCAL_PART_SPLIT_RE = /[._-]+/;
const NON_DIGIT_RE = /\D/g;

// ── Helpers ──────────────────────────────────────────────────────────

function syntheticMondayItemId(email: string): string {
  const hash = createHash("sha1")
    .update(email.toLowerCase().trim())
    .digest("hex")
    .slice(0, 16);
  return `email:${hash}`;
}

function titleCaseFromLocalPart(localPart: string): string {
  return localPart
    .split(LOCAL_PART_SPLIT_RE)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `${(p[0] ?? "").toUpperCase()}${p.slice(1)}`)
    .join(" ")
    .trim();
}

function deriveNameFromEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return email;
  }
  return titleCaseFromLocalPart(email.slice(0, atIndex)) || email;
}

function parseOllamaJson(text: string): Record<string, unknown> | null {
  if (!text) {
    return null;
  }
  const fenceMatch = MARKDOWN_JSON_FENCE_RE.exec(text);
  const cleaned = (fenceMatch?.[1] ?? text).trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

// ── Layer 1: Deterministic Contact-Email Linking ─────────────────────

const LINK_FROM_SQL = `
  WITH inserted AS (
    INSERT INTO contact_emails (contact_id, email_id, relationship)
    SELECT c.id, e.id, 'from'
    FROM emails e
    JOIN contacts c ON LOWER(TRIM(e.from_email)) = LOWER(c.email)
    WHERE e.from_email IS NOT NULL
      AND c.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM contact_emails ce
        WHERE ce.email_id = e.id AND ce.contact_id = c.id AND ce.relationship = 'from'
      )
    ON CONFLICT (contact_id, email_id, relationship) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::text AS cnt FROM inserted`;

const LINK_TO_SQL = `
  WITH inserted AS (
    INSERT INTO contact_emails (contact_id, email_id, relationship)
    SELECT c.id, e.id, 'to'
    FROM emails e
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN e.to_emails IS NOT NULL AND e.to_emails LIKE '[%'
        THEN e.to_emails::jsonb
        ELSE '[]'::jsonb
      END
    ) AS addr(val)
    JOIN contacts c ON LOWER(TRIM(addr.val)) = LOWER(c.email)
    WHERE c.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM contact_emails ce
        WHERE ce.email_id = e.id AND ce.contact_id = c.id AND ce.relationship = 'to'
      )
    ON CONFLICT (contact_id, email_id, relationship) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::text AS cnt FROM inserted`;

const LINK_CC_SQL = `
  WITH inserted AS (
    INSERT INTO contact_emails (contact_id, email_id, relationship)
    SELECT c.id, e.id, 'cc'
    FROM emails e
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN e.cc_emails IS NOT NULL AND e.cc_emails LIKE '[%'
        THEN e.cc_emails::jsonb
        ELSE '[]'::jsonb
      END
    ) AS addr(val)
    JOIN contacts c ON LOWER(TRIM(addr.val)) = LOWER(c.email)
    WHERE c.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM contact_emails ce
        WHERE ce.email_id = e.id AND ce.contact_id = c.id AND ce.relationship = 'cc'
      )
    ON CONFLICT (contact_id, email_id, relationship) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::text AS cnt FROM inserted`;

async function runCountCte(sql: string): Promise<number> {
  const row = await db.query<{ cnt: string }>(sql).get();
  return Number(row?.cnt ?? "0");
}

// ── Layer 2: Contact Creation for Unmatched Senders ──────────────────

const UNMATCHED_SENDERS_SQL = `
  SELECT DISTINCT ON (LOWER(TRIM(e.from_email)))
    LOWER(TRIM(e.from_email)) AS email,
    e.from_name AS name,
    e.account_id
  FROM emails e
  WHERE e.from_email IS NOT NULL
    AND e.account_id IS NOT NULL AND e.account_id > 0
    AND (e.is_internal = 0 OR e.is_internal IS NULL)
    AND (e.is_excluded = 0 OR e.is_excluded IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM contacts c WHERE LOWER(c.email) = LOWER(TRIM(e.from_email))
    )
  ORDER BY LOWER(TRIM(e.from_email)), e.received_at DESC NULLS LAST
  LIMIT ?`;

const INSERT_CONTACT_SQL = `
  INSERT INTO contacts (
    monday_item_id, name, email, account_id, synced_at, updated_at
  ) VALUES (?, ?, ?, ?, now(), now())
  ON CONFLICT (monday_item_id) DO UPDATE SET
    name = CASE
      WHEN contacts.name = contacts.email OR LENGTH(EXCLUDED.name) > LENGTH(contacts.name)
      THEN EXCLUDED.name
      ELSE contacts.name
    END,
    account_id = COALESCE(contacts.account_id, EXCLUDED.account_id),
    updated_at = now()
  RETURNING id`;

async function createContactsFromSenders(limit: number): Promise<number> {
  const senders = await db
    .query<UnmatchedSender, [number]>(UNMATCHED_SENDERS_SQL)
    .all(limit);

  if (senders.length === 0) {
    return 0;
  }

  let created = 0;
  const insertStmt = db.query<{ id: number }, [string, string, string, number]>(
    INSERT_CONTACT_SQL
  );

  for (const sender of senders) {
    const domain = sender.email.split("@")[1] ?? "";
    if (SKIP_SENDER_DOMAINS.has(domain.toLowerCase())) {
      continue;
    }
    if (SKIP_NAME_RE.test(sender.name ?? "")) {
      continue;
    }

    const mondayItemId = syntheticMondayItemId(sender.email);
    const name =
      sender.name && !SKIP_NAME_RE.test(sender.name)
        ? sender.name.trim()
        : deriveNameFromEmail(sender.email);

    const row = await insertStmt.get(
      mondayItemId,
      name,
      sender.email,
      sender.account_id
    );
    if (row) {
      created++;
    }
  }

  return created;
}

// ── Layer 3: LLM Enrichment (granite4 via Ollama) ────────────────────

const CONTACTS_FOR_ENRICHMENT_SQL = `
  SELECT id, email, name
  FROM contacts
  WHERE monday_item_id LIKE 'email:%'
    AND email IS NOT NULL
    AND (phone IS NULL AND title IS NULL)
    AND contractor_searched_at IS NULL
  ORDER BY created_at DESC
  LIMIT ?`;

const SIGNATURE_SNIPPETS_SQL = `
  SELECT body_preview
  FROM emails
  WHERE LOWER(TRIM(from_email)) = ?
    AND body_preview IS NOT NULL
    AND LENGTH(body_preview) > 50
  ORDER BY received_at DESC
  LIMIT ?`;

async function callOllamaJson(
  prompt: string
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Ollama ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseOllamaJson(data.choices?.[0]?.message?.content ?? "");
}

export async function enrichContacts(
  batchSize: number
): Promise<{ enriched: number; errors: number }> {
  const contacts = await db
    .query<ContactForEnrichment, [number]>(CONTACTS_FOR_ENRICHMENT_SQL)
    .all(batchSize);

  if (contacts.length === 0) {
    return { enriched: 0, errors: 0 };
  }

  // Quick health check — skip enrichment if Ollama is down
  try {
    const healthRes = await fetch(OLLAMA_BASE_URL.replace("/v1", ""), {
      signal: AbortSignal.timeout(3000),
    });
    if (!healthRes.ok) {
      return { enriched: 0, errors: 0 };
    }
  } catch {
    return { enriched: 0, errors: 0 };
  }

  let enriched = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      const snippets = await db
        .query<{ body_preview: string }, [string, number]>(
          SIGNATURE_SNIPPETS_SQL
        )
        .all(contact.email.toLowerCase().trim(), 5);

      // Mark as attempted regardless of outcome
      await db.run(
        "UPDATE contacts SET contractor_searched_at = now() WHERE id = ?",
        [contact.id]
      );

      if (snippets.length === 0) {
        continue;
      }

      // Use tail of each snippet (signature area)
      const signatureTexts = snippets
        .map((s) => {
          const text = s.body_preview.trim();
          return text.length > 500 ? text.slice(-500) : text;
        })
        .join("\n---\n");

      const prompt = `Extract contact information for "${contact.name}" (${contact.email}) from these email snippets.
Look for phone number, job title, and company name in the signature block.

${signatureTexts}

Respond with ONLY valid JSON:
{"phone": "digits only or null", "title": "job title or null", "company": "company name or null"}`;

      const result = await callOllamaJson(prompt);
      if (!result) {
        continue;
      }

      const phone =
        typeof result.phone === "string" && result.phone.length >= 7
          ? result.phone.replace(NON_DIGIT_RE, "").slice(-10)
          : null;
      const title =
        typeof result.title === "string" && result.title.length > 1
          ? result.title.trim()
          : null;
      const company =
        typeof result.company === "string" && result.company.length > 1
          ? result.company.trim()
          : null;

      if (!(phone || title || company)) {
        continue;
      }

      const sets: string[] = [];
      const params: (string | number)[] = [];

      if (phone && phone.length >= 10) {
        sets.push("phone = ?");
        params.push(phone);
      }
      if (title) {
        sets.push("title = ?");
        params.push(title);
      }
      if (company) {
        sets.push("imported_account_name = COALESCE(imported_account_name, ?)");
        params.push(company);
      }

      if (sets.length === 0) {
        continue;
      }

      sets.push("updated_at = now()");
      params.push(contact.id);

      await db.run(
        `UPDATE contacts SET ${sets.join(", ")} WHERE id = ?`,
        params
      );
      enriched++;
    } catch (err) {
      console.error(
        `[link-contacts] Enrichment error for #${contact.id} (${contact.email}):`,
        err
      );
      errors++;
      // Still mark as attempted to prevent infinite retry
      await db
        .run(
          "UPDATE contacts SET contractor_searched_at = now() WHERE id = ?",
          [contact.id]
        )
        .catch(() => {
          // Best-effort stamp; ignore secondary failure.
        });
    }
  }

  return { enriched, errors };
}

// ── Main Entry Point ─────────────────────────────────────────────────

export async function linkEmailsToContacts(options?: {
  enrichBatchSize?: number;
  createLimit?: number;
  skipEnrichment?: boolean;
}): Promise<ContactLinkStats> {
  const stats: ContactLinkStats = {
    contactsCreated: 0,
    contactsEnriched: 0,
    enrichmentErrors: 0,
    linkedCc: 0,
    linkedFrom: 0,
    linkedTo: 0,
  };

  // Layer 1: Deterministic linking (existing contacts → contact_emails)
  stats.linkedFrom = await runCountCte(LINK_FROM_SQL);
  stats.linkedTo = await runCountCte(LINK_TO_SQL);
  stats.linkedCc = await runCountCte(LINK_CC_SQL);

  // Layer 2: Create contacts for unmatched external senders
  stats.contactsCreated = await createContactsFromSenders(
    options?.createLimit ?? 500
  );

  // Re-run Layer 1 from-email linking for newly created contacts
  if (stats.contactsCreated > 0) {
    stats.linkedFrom += await runCountCte(LINK_FROM_SQL);
  }

  // Layer 3: LLM enrichment (granite4) — skipped when queued separately
  if (!options?.skipEnrichment) {
    const enrichResult = await enrichContacts(options?.enrichBatchSize ?? 10);
    stats.contactsEnriched = enrichResult.enriched;
    stats.enrichmentErrors = enrichResult.errors;
  }

  return stats;
}

// ── CLI entry point ──────────────────────────────────────────────────

if (import.meta.main) {
  linkEmailsToContacts({ enrichBatchSize: 20, createLimit: 1000 })
    .then((stats) => {
      const totalLinked = stats.linkedFrom + stats.linkedTo + stats.linkedCc;
      console.log(
        `[link-contacts] Done: ${totalLinked} linked (from=${stats.linkedFrom}, to=${stats.linkedTo}, cc=${stats.linkedCc}), ${stats.contactsCreated} contacts created, ${stats.contactsEnriched} enriched (${stats.enrichmentErrors} errors)`
      );
    })
    .catch((err) => {
      console.error("[link-contacts] Failed:", err);
      process.exit(1);
    });
}
