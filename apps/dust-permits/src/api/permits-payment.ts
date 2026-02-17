/**
 * Renew + Pay Permit Handler
 *
 * Thin API handler — validates input, delegates to renewAndPayFull().
 * Payment data comes from DEFAULTS.payment (populated from PAYMENT_* env vars).
 */

import { DEFAULTS } from "@/form-data";
import { persistDraftPermitRecord } from "@/lib/permit-records";
import { renewAndPayFull } from "@/portal/create/flow";
import {
  ensureBrowserSession,
  jsonError,
  jsonSuccess,
  log,
  renewAndPayBodySchema,
} from "./permits-helpers";

/**
 * POST /api/permits/:id/renew-and-pay
 *
 * Renew + submit + pay.
 * Payment data comes from DEFAULTS.payment (PAYMENT_* env vars).
 */
export async function handleRenewAndPay(
  id: string,
  body: unknown
): Promise<Response> {
  log(`\n  RENEW & PAY permit request: ${id}`);

  const parsed = renewAndPayBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const { companyName, expedited } = parsed.data;

  // Check payment defaults are populated (from env vars)
  if (!DEFAULTS.payment.card.cardNumber) {
    return jsonError(
      "Payment env vars not configured (PAYMENT_CARD_NUMBER missing)",
      500
    );
  }

  try {
    const sessionResult = await ensureBrowserSession();
    if (sessionResult.success === false) {
      return jsonError(sessionResult.error, 500);
    }

    const ctx = sessionResult.page;

    const result = await renewAndPayFull(
      ctx.page,
      ctx.context,
      id,
      companyName,
      { expedited }
    );

    // Persist draft record if we got an applicationId
    if (result.applicationId) {
      await persistDraftPermitRecord({
        applicationId: result.applicationId,
        companyName,
        flow: "renew",
        sourcePermitId: id,
      });
    }

    if (!result.success) {
      return jsonError(result.error || `Failed at stage: ${result.stage}`, 500);
    }

    return jsonSuccess(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  Renew & Pay error: ${errorMsg}`);
    return jsonError(`Renew & Pay error: ${errorMsg}`, 500);
  }
}
