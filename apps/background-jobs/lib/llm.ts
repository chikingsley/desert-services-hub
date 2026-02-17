/**
 * LLM JSON prompt runner — multi-provider (OpenAI-compatible endpoints)
 *
 * Supports:
 *   - Gemini (cloud, default for real-time triage)
 *   - Ollama / any OpenAI-compatible local endpoint (for backfill)
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const LOCAL_LLM_BASE =
  process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:11434/v1";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL ?? "granite4:latest";

const MARKDOWN_JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;

export type LlmProvider = "gemini" | "local";

export interface LlmPromptOptions {
  model: string;
  provider?: LlmProvider;
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

function getEndpoint(provider: LlmProvider): {
  baseUrl: string;
  apiKey: string | null;
} {
  if (provider === "local") {
    return { baseUrl: LOCAL_LLM_BASE, apiKey: null };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return { baseUrl: GEMINI_BASE, apiKey };
}

export async function runJsonPrompt(
  prompt: string,
  options: LlmPromptOptions
): Promise<Record<string, unknown> | null> {
  const provider = options.provider ?? "gemini";
  const { baseUrl, apiKey } = getEndpoint(provider);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error (${provider}): ${response.status} - ${err}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseJsonObject(content);
}

/** Convenience: Gemini call with provider pre-set */
export function runGeminiJsonPrompt(
  prompt: string,
  options: { model: string }
): Promise<Record<string, unknown> | null> {
  return runJsonPrompt(prompt, { ...options, provider: "gemini" });
}

/** Convenience: Local LLM call (Ollama / vLLM) */
export function runLocalLlmJsonPrompt(
  prompt: string,
  options?: { model?: string }
): Promise<Record<string, unknown> | null> {
  return runJsonPrompt(prompt, {
    model: options?.model ?? LOCAL_LLM_MODEL,
    provider: "local",
  });
}
