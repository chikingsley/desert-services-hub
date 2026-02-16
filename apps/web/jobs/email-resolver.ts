import { resolveEmailToEstimate } from "@email/resolution/resolve-estimate";
import { resolveEmailToProject } from "@email/resolution/resolve-project";
import { linkEmailToEstimate } from "@lib/db/repositories/estimate-email";
import { EMAIL_RESOLVER_ENABLED, EMAIL_RESOLVER_SPARK_MODEL } from "./config";
import { runSparkEstimateTieBreaker } from "./email-resolver-spark";

export async function processEmailResolveJob(emailId: number): Promise<void> {
  if (!EMAIL_RESOLVER_ENABLED) {
    return;
  }

  const projectResult = await resolveEmailToProject(emailId, {
    persistReview: true,
    reviewSource: "email_resolver",
  });

  const estimateResult = await resolveEmailToEstimate(emailId, { limit: 6 });
  if (estimateResult.status === "ambiguous") {
    const sparkChoice = await runSparkEstimateTieBreaker(
      emailId,
      estimateResult
    );
    if (sparkChoice) {
      const linked = await linkEmailToEstimate(
        sparkChoice.estimateId,
        emailId,
        "agent",
        `email_resolver spark model=${EMAIL_RESOLVER_SPARK_MODEL} confidence=${sparkChoice.confidence.toFixed(3)} reason=${sparkChoice.reason}`
      );

      if (linked) {
        console.log(
          `[email-resolver] email #${emailId}: linked estimate #${sparkChoice.estimateId} via spark tie-breaker (${sparkChoice.confidence.toFixed(3)})`
        );
        return;
      }
    }
  }

  console.log(
    `[email-resolver] email #${emailId}: project=${projectResult.status} (${projectResult.detail}); estimate=${estimateResult.status} (${estimateResult.detail})`
  );
}
