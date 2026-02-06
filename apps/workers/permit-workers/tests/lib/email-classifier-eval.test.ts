/**
 * Email Classifier Evaluation
 *
 * Runs the LLM-based classifier against a labeled dataset and measures accuracy.
 * Unlike unit tests (which are deterministic pass/fail), evals measure probabilistic
 * accuracy and help detect model regressions.
 *
 * Run with: bun test tests/lib/email-classifier-eval.test.ts
 */

import { describe, expect, it } from "bun:test";
import {
  LABELED_EMAILS,
  type LabeledEmail,
} from "@tests/fixtures/email-classifier-dataset";
import {
  classifyEmail,
  type EmailIntent,
  mightBeDustPermit,
} from "@/lib/email-classifier";

// =============================================================================
// Configuration
// =============================================================================

const LLM_ENDPOINT = "https://llama.peacockery.studio/v1/chat/completions";

// Minimum accuracy thresholds (0.0 - 1.0)
const ACCURACY_THRESHOLDS = {
  keywordFilter: 0.95, // Keyword filter should be very accurate
  intentClassification: 0.75, // LLM can be less accurate, but should be decent
  isDustPermit: 0.85, // Binary classification should be fairly accurate
};

// =============================================================================
// Helpers
// =============================================================================

interface EvalResult {
  email: LabeledEmail;
  keywordFilterPassed: boolean;
  keywordFilterCorrect: boolean;
  classificationResult?: {
    isDustPermit: boolean;
    intent: EmailIntent;
  };
  isDustPermitCorrect?: boolean;
  intentCorrect?: boolean;
  error?: string;
}

async function isEndpointAvailable(): Promise<boolean> {
  try {
    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function calculateAccuracy(
  results: EvalResult[],
  metric: keyof EvalResult
): number {
  const applicable = results.filter((r) => r[metric] !== undefined);
  if (applicable.length === 0) {
    return 0;
  }
  const correct = applicable.filter((r) => r[metric] === true).length;
  return correct / applicable.length;
}

// =============================================================================
// Keyword Filter Eval (no API required)
// =============================================================================

describe("eval: keyword filter accuracy", () => {
  it("meets accuracy threshold for dust permit detection", () => {
    const results: EvalResult[] = LABELED_EMAILS.map((labeled) => {
      const passed = mightBeDustPermit(labeled.email);
      // Filter should pass for dust permit emails, fail for non-dust permit
      const correct = labeled.expected.isDustPermit ? passed : !passed;
      return {
        email: labeled,
        keywordFilterPassed: passed,
        keywordFilterCorrect: correct,
      };
    });

    const accuracy = calculateAccuracy(results, "keywordFilterCorrect");
    const failures = results.filter((r) => !r.keywordFilterCorrect);

    // Report results
    console.log(`\nKeyword Filter Accuracy: ${(accuracy * 100).toFixed(1)}%`);
    console.log(
      `  Threshold: ${(ACCURACY_THRESHOLDS.keywordFilter * 100).toFixed(1)}%`
    );
    console.log(
      `  Total: ${results.length}, Correct: ${results.length - failures.length}`
    );

    if (failures.length > 0) {
      console.log("\nMisclassified:");
      for (const f of failures) {
        console.log(
          `  - ${f.email.id}: expected ${f.email.expected.isDustPermit ? "pass" : "fail"}, got ${f.keywordFilterPassed ? "pass" : "fail"}`
        );
      }
    }

    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.keywordFilter);
  });
});

// =============================================================================
// LLM Classifier Eval (requires endpoint)
// =============================================================================

describe("eval: LLM classifier accuracy", () => {
  it("meets accuracy thresholds for intent classification", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping LLM eval: endpoint not available");
      return;
    }

    const results: EvalResult[] = [];

    // Run classifier on all emails (in sequence to avoid overwhelming local LLM)
    for (const labeled of LABELED_EMAILS) {
      try {
        const result = await classifyEmail(labeled.email);
        results.push({
          email: labeled,
          keywordFilterPassed: mightBeDustPermit(labeled.email),
          keywordFilterCorrect: true, // Not evaluating here
          classificationResult: {
            isDustPermit: result.is_dust_permit,
            intent: result.intent,
          },
          isDustPermitCorrect:
            result.is_dust_permit === labeled.expected.isDustPermit,
          intentCorrect: result.intent === labeled.expected.intent,
        });
      } catch (error) {
        results.push({
          email: labeled,
          keywordFilterPassed: mightBeDustPermit(labeled.email),
          keywordFilterCorrect: true,
          error: String(error),
        });
      }
    }

    // Calculate metrics
    const isDustPermitAccuracy = calculateAccuracy(
      results,
      "isDustPermitCorrect"
    );
    const intentAccuracy = calculateAccuracy(results, "intentCorrect");
    const errors = results.filter((r) => r.error);

    // Report results
    console.log("\n=== LLM Classifier Evaluation ===");
    console.log(`Total samples: ${results.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(
      `\nisDustPermit Accuracy: ${(isDustPermitAccuracy * 100).toFixed(1)}%`
    );
    console.log(
      `  Threshold: ${(ACCURACY_THRESHOLDS.isDustPermit * 100).toFixed(1)}%`
    );
    console.log(`\nIntent Accuracy: ${(intentAccuracy * 100).toFixed(1)}%`);
    console.log(
      `  Threshold: ${(ACCURACY_THRESHOLDS.intentClassification * 100).toFixed(1)}%`
    );

    // Show misclassified intents
    const intentFailures = results.filter(
      (r) => r.intentCorrect === false && !r.error
    );
    if (intentFailures.length > 0) {
      console.log("\nIntent Misclassifications:");
      for (const f of intentFailures) {
        console.log(
          `  - ${f.email.id}: expected "${f.email.expected.intent}", got "${f.classificationResult?.intent}"`
        );
      }
    }

    // Show errors
    if (errors.length > 0) {
      console.log("\nClassification Errors:");
      for (const e of errors) {
        console.log(`  - ${e.email.id}: ${e.error}`);
      }
    }

    // Assert thresholds
    expect(isDustPermitAccuracy).toBeGreaterThanOrEqual(
      ACCURACY_THRESHOLDS.isDustPermit
    );
    expect(intentAccuracy).toBeGreaterThanOrEqual(
      ACCURACY_THRESHOLDS.intentClassification
    );
  });

  it("reports per-intent accuracy breakdown", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping LLM eval: endpoint not available");
      return;
    }

    const intents: EmailIntent[] = [
      "intake",
      "renewal",
      "revision",
      "contact",
      "notification",
      "ignore",
    ];

    const resultsByIntent: Record<
      EmailIntent,
      { total: number; correct: number }
    > = {
      intake: { total: 0, correct: 0 },
      renewal: { total: 0, correct: 0 },
      revision: { total: 0, correct: 0 },
      contact: { total: 0, correct: 0 },
      notification: { total: 0, correct: 0 },
      ignore: { total: 0, correct: 0 },
    };

    // Run classifier
    for (const labeled of LABELED_EMAILS) {
      try {
        const result = await classifyEmail(labeled.email);
        const expected = labeled.expected.intent;
        resultsByIntent[expected].total += 1;
        if (result.intent === expected) {
          resultsByIntent[expected].correct += 1;
        }
      } catch {
        // Skip errors in per-intent breakdown
      }
    }

    // Report
    console.log("\n=== Per-Intent Accuracy ===");
    for (const intent of intents) {
      const { total, correct } = resultsByIntent[intent];
      if (total > 0) {
        const accuracy = ((correct / total) * 100).toFixed(1);
        console.log(`${intent.padEnd(12)}: ${accuracy}% (${correct}/${total})`);
      }
    }

    // This test is informational only, no assertions
    expect(true).toBe(true);
  });
});

// =============================================================================
// Confusion Matrix (for debugging)
// =============================================================================

describe("eval: confusion matrix", () => {
  it("shows classification confusion matrix", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping confusion matrix: endpoint not available");
      return;
    }

    const intents: EmailIntent[] = [
      "intake",
      "renewal",
      "revision",
      "contact",
      "notification",
      "ignore",
    ];

    // Build confusion matrix
    const matrix: Record<EmailIntent, Record<EmailIntent, number>> = {
      intake: {
        intake: 0,
        renewal: 0,
        revision: 0,
        contact: 0,
        notification: 0,
        ignore: 0,
      },
      renewal: {
        intake: 0,
        renewal: 0,
        revision: 0,
        contact: 0,
        notification: 0,
        ignore: 0,
      },
      revision: {
        intake: 0,
        renewal: 0,
        revision: 0,
        contact: 0,
        notification: 0,
        ignore: 0,
      },
      contact: {
        intake: 0,
        renewal: 0,
        revision: 0,
        contact: 0,
        notification: 0,
        ignore: 0,
      },
      notification: {
        intake: 0,
        renewal: 0,
        revision: 0,
        contact: 0,
        notification: 0,
        ignore: 0,
      },
      ignore: {
        intake: 0,
        renewal: 0,
        revision: 0,
        contact: 0,
        notification: 0,
        ignore: 0,
      },
    };

    // Populate
    for (const labeled of LABELED_EMAILS) {
      try {
        const result = await classifyEmail(labeled.email);
        const expected = labeled.expected.intent;
        const predicted = result.intent;
        matrix[expected][predicted] += 1;
      } catch {
        // Skip errors
      }
    }

    // Print confusion matrix
    console.log("\n=== Confusion Matrix (Expected → Predicted) ===");
    console.log(
      `             ${intents.map((i) => i.slice(0, 4).padStart(5)).join("")}`
    );
    for (const expected of intents) {
      const row = intents.map((predicted) =>
        String(matrix[expected][predicted]).padStart(5)
      );
      console.log(`${expected.padEnd(12)} ${row.join("")}`);
    }

    // This test is informational only
    expect(true).toBe(true);
  });
});
