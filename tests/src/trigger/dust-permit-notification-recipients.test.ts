import { describe, expect, test } from "bun:test";

import { extractReplyAllExternalRecipients } from "../../../apps/trigger-dev/src/trigger/dust-permit-notification-recipients";

describe("dust permit notification recipients", () => {
  test("uses the reply source email to build external reply-all recipients", () => {
    const recipients = extractReplyAllExternalRecipients({
      ccEmails: [
        "rick@desertservices.net",
        "jtvincent@stevensleinweber.com",
      ],
      fromEmail: "aashton@stevensleinweber.com",
      toEmails: ["chi@desertservices.net", "contracts@desertservices.net"],
    });

    expect(recipients).toEqual([
      "aashton@stevensleinweber.com",
      "jtvincent@stevensleinweber.com",
    ]);
  });
});
