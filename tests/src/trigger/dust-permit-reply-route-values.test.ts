import { describe, expect, test } from "bun:test";

import {
  buildPermitReplySearchTerms,
  selectPermitReplyRoute,
} from "../../../apps/trigger-dev/src/trigger/dust-permit-reply-route-values";

describe("dust permit reply route values", () => {
  test("builds a short project alias for text-first email search", () => {
    expect(
      buildPermitReplySearchTerms({
        companyName: "Stevens Leinweber Construction Inc",
        permitId: "D0065531",
        projectName: "LPC 75TH AVE TRAILER PARKING",
      })
    ).toEqual([
      "D0065531",
      "LPC 75TH AVE TRAILER PARKING",
      "LPC 75TH AVE",
      "Stevens Leinweber Construction Inc",
      "Stevens Leinweber Construction",
    ]);
  });

  test("selects the external chi-copy thread for reply-all", () => {
    const selection = selectPermitReplyRoute(
      [
        {
          bodyText:
            "A dust permit application has been submitted to Maricopa County. Please prepare for billing.",
          ccEmails: [],
          chiEmailId: 1182834,
          emailId: 1182834,
          fromEmail: "chi@desertservices.net",
          hasChiCopy: true,
          isForwarded: false,
          isInternal: true,
          mailboxEmail: "chi@desertservices.net",
          receivedAt: "2026-03-10T22:24:25.000Z",
          subject: "Dust Permit Billing - Commerce 303",
          toEmails: ["eva@desertservices.net"],
        },
        {
          bodyText:
            "Will do Hayden Koning Project Manager ... From: Chi Ejimofor ... Subject: RE: Commerce 303 - BPR Companies || Dust Permit + LOI",
          ccEmails: [
            "Quenting@bprcompanies.com",
            "vishk@bprcompanies.com",
            "Jayson@desertservices.net",
            "rick@desertservices.net",
          ],
          chiEmailId: 1180344,
          emailId: 1180344,
          fromEmail: "haydenk@bprcompanies.com",
          hasChiCopy: true,
          isForwarded: false,
          isInternal: false,
          mailboxEmail: "chi@desertservices.net",
          receivedAt: "2026-03-10T17:24:52.000Z",
          subject: "RE: Commerce 303 - BPR Companies || Dust Permit + LOI",
          toEmails: ["chi@desertservices.net"],
        },
        {
          bodyText:
            "The dust control permit for BPR Companies LLC on project Commerce 303 has been issued.",
          ccEmails: [
            "Quenting@bprcompanies.com",
            "vishk@bprcompanies.com",
          ],
          chiEmailId: 1187879,
          emailId: 1187879,
          fromEmail: "chi@desertservices.net",
          hasChiCopy: true,
          isForwarded: false,
          isInternal: true,
          mailboxEmail: "chi@desertservices.net",
          receivedAt: "2026-03-11T22:16:09.000Z",
          subject: "RE: Commerce 303 - BPR Companies || Dust Permit + LOI",
          toEmails: ["haydenk@bprcompanies.com"],
        },
        {
          bodyText:
            "Facility ID#: F039665 Facility Name: Commerce 303 Facility Address: 5215 N ALSUP RD",
          ccEmails: [],
          chiEmailId: 1142490,
          emailId: 1142490,
          fromEmail: "no-reply@maricopa.gov",
          hasChiCopy: true,
          isForwarded: false,
          isInternal: false,
          mailboxEmail: "chi@desertservices.net",
          receivedAt: "2026-03-06T22:58:32.000Z",
          subject: "Dust Permit Issued",
          toEmails: ["bjc@bprcompanies.com"],
        },
        {
          bodyText:
            "Please bill this permit. Forwarding the thread for visibility.",
          ccEmails: [],
          chiEmailId: null,
          emailId: 1182892,
          fromEmail: "kerin@desertservices.net",
          hasChiCopy: false,
          isForwarded: true,
          isInternal: true,
          mailboxEmail: "francine@desertservices.net",
          receivedAt: "2026-03-10T22:26:04.000Z",
          subject: "FW: Commerce 303 permit thread",
          toEmails: ["francine@desertservices.net"],
        },
      ],
      {
        permitId: "D0065310",
        projectName: "Commerce 303",
      }
    );

    expect(selection.mode).toBe("reply-all");
    expect(selection.replyToEmailId).toBe(1180344);
    expect(selection.selectedCandidateEmailId).toBe(1180344);
    expect(selection.matchedRecipients).toEqual([
      "haydenk@bprcompanies.com",
      "quenting@bprcompanies.com",
      "vishk@bprcompanies.com",
    ]);
    expect(selection.rankedCandidates[0]?.emailId).toBe(1180344);
  });

  test("falls back to compose-new when no chi mailbox copy exists", () => {
    const selection = selectPermitReplyRoute(
      [
        {
          bodyText: "I need you to get the Dust Control Permit. Do you do that?",
          ccEmails: ["Kerin@desertservices.net"],
          chiEmailId: null,
          emailId: 1181870,
          fromEmail: "RMasi@stevensleinweber.com",
          hasChiCopy: false,
          isForwarded: false,
          isInternal: false,
          mailboxEmail: "kerin@desertservices.net",
          receivedAt: "2026-03-10T20:17:06.000Z",
          subject: "RE: LPC 75th Ave -NOI /Dust Control Permit",
          toEmails: ["danielr@desertservices.net"],
        },
        {
          bodyText:
            "You will need to bill for the dust permit on this one. From: Chi Ejimofor...",
          ccEmails: [],
          chiEmailId: null,
          emailId: 1182892,
          fromEmail: "Kerin@desertservices.net",
          hasChiCopy: false,
          isForwarded: true,
          isInternal: true,
          mailboxEmail: "francine@desertservices.net",
          receivedAt: "2026-03-10T22:26:04.000Z",
          subject: "FW: LPC 75th Ave -NOI /Dust Control Permit",
          toEmails: ["francine@desertservices.net"],
        },
      ],
      {
        permitId: "D0065531",
        projectName: "LPC 75TH AVE TRAILER PARKING",
      }
    );

    expect(selection.mode).toBe("compose-new");
    expect(selection.replyToEmailId).toBeNull();
    expect(selection.selectedCandidateEmailId).toBe(1181870);
    expect(selection.matchedRecipients).toEqual([
      "rmasi@stevensleinweber.com",
    ]);
    expect(selection.rankedCandidates[0]?.emailId).toBe(1181870);
  });

  test("prefers customer thread over county expedite thread", () => {
    const selection = selectPermitReplyRoute(
      [
        {
          bodyText:
            "Good morning Chi, that application is set for final review today.",
          ccEmails: [],
          chiEmailId: 1216823,
          emailId: 1216823,
          fromEmail: "Susan.Jerabek@maricopa.gov",
          hasChiCopy: true,
          isForwarded: false,
          isInternal: false,
          mailboxEmail: "chi@desertservices.net",
          receivedAt: "2026-03-20T15:53:02.000Z",
          subject: 'RE: Expedite Request: D0065566 "Tru Grocer FCU"',
          toEmails: ["chi@desertservices.net"],
        },
        {
          bodyText:
            "Please reach out to me directly with any questions. We'd like to get going asap on BMP installation and filing for dust control permit.",
          ccEmails: [
            "danielr@desertservices.net",
            "francine@desertservices.net",
            "Jayson@desertservices.net",
          ],
          chiEmailId: 1187093,
          emailId: 1187093,
          fromEmail: "justin@colleycontracting.com",
          hasChiCopy: true,
          isForwarded: false,
          isInternal: false,
          mailboxEmail: "chi@desertservices.net",
          receivedAt: "2026-03-11T17:06:59.000Z",
          subject: "Re: Tru Grocer Tolleson Dust Permit",
          toEmails: ["contracts@desertservices.net"],
        },
      ],
      {
        permitId: "D0065566",
        projectName: "Tru Grocer FCU",
      }
    );

    expect(selection.mode).toBe("reply-all");
    expect(selection.replyToEmailId).toBe(1187093);
    expect(selection.selectedCandidateEmailId).toBe(1187093);
    expect(selection.matchedRecipients).toEqual([
      "justin@colleycontracting.com",
    ]);
    expect(selection.rankedCandidates[0]?.emailId).toBe(1187093);
  });
});
