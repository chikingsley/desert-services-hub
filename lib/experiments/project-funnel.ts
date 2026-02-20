import { db } from "@lib/db/client";
import { GoogleGenAI, Schema, Type } from "@google/genai";

const { GEMINI_API_KEY } = process.env;

function getGenAIClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

async function fetchTestEmails(limit: number) {
  // Grab emails from Chi that have a project ID already
  return db.query(`
    SELECT e.id, e.subject, e.body_full, e.from_email, m.email as mailbox, e.project_id
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE e.project_id IS NOT NULL 
      AND m.email = 'chi@desertservices.net'
      AND e.from_email NOT ILIKE '%desertservices.net%'
    ORDER BY e.received_at DESC
    LIMIT $1
  `).all(limit);
}

const ExtractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    projectMentions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Any specific project names, cross streets, or client job numbers mentioned in the email subject or body.",
    }
  },
  required: ["projectMentions"]
};

async function extractProjectMentions(subject: string, bodyText: string): Promise<string[]> {
  const client = getGenAIClient();
  const prompt = `
    Read the following email and extract the project name, address, or job number if mentioned.
    Return an empty array if none are found. Keep it short.
    
    Subject: ${subject}
    Body: ${bodyText.substring(0, 2000)}
  `.trim();

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash", 
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: ExtractionSchema,
      temperature: 0.1,
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  return parsed.projectMentions || [];
}

async function getCandidateEstimatesBySender(fromEmail: string, extractedMentions: string[]) {
  const domain = fromEmail.split("@")[1];
  
  // Find accounts linked to this domain
  const accounts = await db.query(`
    SELECT id as account_id FROM accounts 
    WHERE (domain ILIKE '%' || $1 || '%')
    UNION
    SELECT account_id FROM contacts
    WHERE email = $2 AND account_id IS NOT NULL
  `).all(domain, fromEmail);

  const accountIds = Array.from(new Set(accounts.map(a => a.account_id)));
  


  
  let estimates = [];
  if (accountIds.length > 0) {
    const placeholders = accountIds.map((_, i) => `${i + 1}`).join(",");
    estimates = await db.query(`
      SELECT e.id, e.name as project_name, e.location as project_address, e.bid_status as status, e.bid_value as total_amount, pe.project_id, p.name as actual_project_name
      FROM estimates e
      LEFT JOIN project_estimates pe ON pe.estimate_id = e.id
      LEFT JOIN projects p ON p.id = pe.project_id
      WHERE e.account_id IN (${placeholders})
      ORDER BY e.id DESC
      LIMIT 30
    `).all(...accountIds);
  }
  
  if (estimates.length === 0 && extractedMentions.length > 0) {
    const terms = extractedMentions.join(' | ').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().replace(/\s+/g, ' | ');
    if (terms) {
       try {
           estimates = await db.query(`
              SELECT e.id, e.name as project_name, e.location as project_address, e.bid_status as status, e.bid_value as total_amount, pe.project_id, p.name as actual_project_name
              FROM estimates e
              LEFT JOIN project_estimates pe ON pe.estimate_id = e.id
              LEFT JOIN projects p ON p.id = pe.project_id
              WHERE to_tsvector('english', coalesce(e.name, '')) @@ to_tsquery('english', $1::text)
              ORDER BY e.id DESC
              LIMIT 10
           `).all(terms);
       } catch (err) {
           console.log("FTS search error:", err.message);
       }
    }
  }
  return estimates;
}
