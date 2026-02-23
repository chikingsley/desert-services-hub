import { db } from "@lib/db/client";
import { rerank } from "@/packages/enrichment/jina/client";

async function fetchTestEmails(limit: number) {
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

async function getCandidateEstimatesBySender(fromEmail: string, subject: string, bodyText: string) {
  const domain = fromEmail.split("@")[1];
  
  const accounts = await db.query(`
    SELECT id as account_id FROM accounts 
    WHERE (domain ILIKE '%' || $1 || '%')
    UNION
    SELECT account_id FROM contacts
    WHERE email = $2 AND account_id IS NOT NULL
  `).all(domain, fromEmail);

  const accountIds = Array.from(new Set(accounts.map(a => a.account_id)));
  
  let estimates: any[] = [];
  if (accountIds.length > 0) {
    const placeholders = accountIds.map((_, i) => `${i + 1}`).join(",");
    estimates = await db.query(`
      SELECT e.id, e.name as project_name, e.location as project_address, e.bid_status as status, e.bid_value as total_amount, pe.project_id, p.name as actual_project_name
      FROM estimates e
      LEFT JOIN project_estimates pe ON pe.estimate_id = e.id
      LEFT JOIN projects p ON p.id = pe.project_id
      WHERE e.account_id IN (${placeholders}) OR pe.project_id IN (
         SELECT p2.id FROM projects p2 WHERE p2.account_id IN (${placeholders})
      )
      ORDER BY e.id DESC
      LIMIT 50
    `).all(...accountIds);
  }
  
  if (subject) {
    // Generate an OR-based ILIKE condition for every word > 4 chars in the subject to cast a wide net
    const words = subject.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
    if (words.length > 0) {
       try {
           // Postgres doesn't like building dynamic arrays of params in this driver unless wrapped perfectly.
           // We can just construct the query with inline parameterized strings using the native driver format, or fallback to the proven text match.
           const combinedText = subject + " " + bodyText.substring(0, 500);
    const terms = combinedText.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 4).slice(0, 10).join(' | ');
           const ftsEstimates = terms.length > 0 ? await db.query(`
              SELECT e.id, e.name as project_name, e.location as project_address, e.bid_status as status, e.bid_value as total_amount, pe.project_id, p.name as actual_project_name
              FROM estimates e
              LEFT JOIN project_estimates pe ON pe.estimate_id = e.id
              LEFT JOIN projects p ON p.id = pe.project_id
              WHERE to_tsvector('english', coalesce(e.name, '') || ' ' || coalesce(p.name, '')) @@ to_tsquery('english', CAST($1 AS TEXT))
              ORDER BY e.id DESC
              LIMIT 50
           `).all(terms) : [];
           
           // Merge and deduplicate
           const existingIds = new Set(estimates.map(e => e.id));
           for (const ftsEst of ftsEstimates) {
               if (!existingIds.has(ftsEst.id)) {
                   estimates.push(ftsEst);
               }
           }
       } catch (err) {
           console.log("FTS search error:", err.message);
       }
    }
  }
  
  // Let's print out what we found
  return estimates;

}

async function rerankCandidates(subject: string, bodyText: string, candidates: any[]) {
  if (candidates.length === 0) return { bestMatchEstimateId: null, confidence: 0, reason: "No candidates" };
  if (candidates.length === 1) return { bestMatchEstimateId: candidates[0].id, confidence: 1, reason: "Only one candidate" };

  const documents = candidates.map(c => 
    `[ESTIMATE TITLE: ${c.project_name || c.actual_project_name}] [ADDRESS: ${c.project_address || 'None'}] [VALUE: ${c.total_amount || 'Unknown'}]`
  );

  const query = `Subject: ${subject}\nBody: ${bodyText.substring(0, 1000)}`;

  try {
    const response = await rerank(query, documents, {
      topN: 1,
      returnDocuments: false,
    });

    const bestResult = response.results[0];
    if (!bestResult) return { bestMatchEstimateId: null, confidence: 0, reason: "Re-ranker returned no results" };

    const matchedEstimate = candidates[bestResult.index];
    
    return { 
      bestMatchEstimateId: matchedEstimate.id, 
      confidence: bestResult.relevance_score, 
      reason: `Jina selected ${matchedEstimate.project_name || matchedEstimate.actual_project_name} with score ${bestResult.relevance_score.toFixed(4)}`
    };
  } catch (error) {
    console.error("Jina rerank failed:", error);
    return { bestMatchEstimateId: null, confidence: 0, reason: "Reranker failed" };
  }
}

async function run() {
  console.log("Fetching 5 real, messy emails that already have project IDs...");
  const emails = await fetchTestEmails(5);

  let successCount = 0;

  for (const email of emails) {
    console.log("\n==================================================");
    console.log(`Email ID: ${email.id} | From: ${email.from_email}`);
    console.log(`Subject : ${email.subject}`);
    console.log(`GROUND TRUTH PROJECT ID: ${email.project_id}`);
    console.log("--------------------------------------------------");

    const candidates = await getCandidateEstimatesBySender(email.from_email, email.subject || "", email.body_full || "");
    console.log(`1. Finding candidates by Account domain... Found ${candidates.length} open estimates.`);
    const groundTruthInCandidates = candidates.some(c => c.project_id === email.project_id);
    console.log(`   Ground Truth Project ${email.project_id} is in candidates list: ${groundTruthInCandidates ? 'YES' : 'NO'}`);

    if (candidates.length === 0) {
      console.log("   ❌ Pipeline failed early. No candidates found from Account or FTS fallback.");
      continue;
    }

    console.log("2. Re-ranking candidates against email body (Using Jina)...");
    const result = await rerankCandidates(email.subject || "", email.body_full || "", candidates);

    console.log(`\n   MATCHED ESTIMATE ID: ${result.bestMatchEstimateId} (Confidence: ${result.confidence})`);
    console.log(`   REASON: ${result.reason}`);

    const matchedEstimate = candidates.find(c => c.id === result.bestMatchEstimateId);
    if (matchedEstimate && matchedEstimate.project_id === email.project_id) {
      console.log(`   ✅ SUCCESS: Pipeline chose Estimate ${matchedEstimate.id} which correctly points to Project ${email.project_id}`);
      successCount++;
    } else {
      console.log(`   ❌ FAILED: Pipeline chose Project ${matchedEstimate?.project_id}, but real Project was ${email.project_id}`);
    }
  }

  console.log(`\nFinal Score: ${successCount} / ${emails.length} correct matches.`);
}

run().catch(console.error);
