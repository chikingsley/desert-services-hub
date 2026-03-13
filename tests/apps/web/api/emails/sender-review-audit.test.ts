import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import { getSenderReviewAudit } from "@/api/emails/sender-review";

const TEST_DOMAIN = "sender-review-audit-test.example";

function makeAuditRequest(domain: string): Request & { params: { domain: string } } {
  const req = new Request(
    `http://localhost/api/emails/sender-review/${encodeURIComponent(domain)}/audit`,
    { method: "GET" }
  ) as Request & { params: { domain: string } };
  req.params = { domain };
  return req;
}

describe("getSenderReviewAudit", () => {
  beforeAll(async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS domain_classifications (
      domain TEXT PRIMARY KEY,
      is_work_related BOOLEAN NOT NULL,
      category TEXT,
      confidence DOUBLE PRECISION,
      reason TEXT,
      provider TEXT,
      model TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);

    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS prompt_version TEXT`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS prompt_text TEXT`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS prompt_input JSONB`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS raw_result JSONB`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS metadata JSONB`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS input_tokens INTEGER`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS output_tokens INTEGER`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS total_tokens INTEGER`
    );
    await db.run(
      `ALTER TABLE domain_classifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`
    );

    await db.run(
      `INSERT INTO domain_classifications (
        domain,
        is_work_related,
        category,
        confidence,
        reason,
        provider,
        model,
        prompt_version,
        prompt_text,
        prompt_input,
        raw_result,
        metadata,
        processing_time_ms,
        input_tokens,
        output_tokens,
        total_tokens
      ) VALUES (
        $1, true, 'work_related', 0.98, 'Project traffic', 'openrouter', 'google/gemini-3.1-flash-lite-preview',
        'sender_domain_v1',
        'Prompt version: sender_domain_v1',
        $2::jsonb,
        $3::jsonb,
        $4::jsonb,
        432,
        111,
        22,
        133
      )
      ON CONFLICT (domain) DO UPDATE SET
        prompt_version = excluded.prompt_version,
        prompt_text = excluded.prompt_text,
        prompt_input = excluded.prompt_input,
        raw_result = excluded.raw_result,
        metadata = excluded.metadata,
        processing_time_ms = excluded.processing_time_ms,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        total_tokens = excluded.total_tokens,
        provider = excluded.provider,
        model = excluded.model`,
      [
        TEST_DOMAIN,
        JSON.stringify({
          domain: TEST_DOMAIN,
          emailCount: 7,
          samples: [{ subject: "Project kickoff" }],
        }),
        JSON.stringify({
          isWorkRelated: true,
          category: "work_related",
          confidence: 0.98,
          reason: "Project traffic",
        }),
        JSON.stringify({
          usage: {
            prompt_tokens: 111,
            completion_tokens: 22,
            total_tokens: 133,
          },
        }),
      ]
    );
  });

  afterAll(async () => {
    await db.run("DELETE FROM domain_classifications WHERE domain = $1", [
      TEST_DOMAIN,
    ]);
  });

  test("returns sender-review audit metadata for a domain", async () => {
    const response = await getSenderReviewAudit(makeAuditRequest(TEST_DOMAIN));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      audit: {
        domain: string;
        inputTokens: number | null;
        outputTokens: number | null;
        promptInput: { emailCount: number };
        promptText: string | null;
        promptVersion: string | null;
        provider: string | null;
        totalTokens: number | null;
      };
    };

    expect(body.audit.domain).toBe(TEST_DOMAIN);
    expect(body.audit.provider).toBe("openrouter");
    expect(body.audit.promptVersion).toBe("sender_domain_v1");
    expect(body.audit.promptText).toContain("sender_domain_v1");
    expect(body.audit.promptInput.emailCount).toBe(7);
    expect(body.audit.inputTokens).toBe(111);
    expect(body.audit.outputTokens).toBe(22);
    expect(body.audit.totalTokens).toBe(133);
  });
});
