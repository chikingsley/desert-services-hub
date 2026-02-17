/**
 * LLM JSON prompt runner — Gemini REST API (OpenAI-compatible endpoint)
 *
 * Calls Gemini via the OpenAI-compatible REST endpoint using GEMINI_API_KEY.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

const MARKDOWN_JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;

export interface OpencodeOptions {
  model: string;
  timeoutMs: number;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) {
    return null;
  }

  const fenceMatch = MARKDOWN_JSON_FENCE_RE.exec(text);
  const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function runOpencodeJsonPrompt(
  prompt: string,
  options: OpencodeOptions
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${err}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseJsonObject(content);
  } finally {
    clearTimeout(timeout);
  }
}
