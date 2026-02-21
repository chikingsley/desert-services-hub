import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EstimateCandidateResult } from "@lib/db/repositories/types";
import type { Email } from "@lib/db/types";

interface MockState {
  attachmentRows: Array<{
    content_type: string | null;
    extracted_text: string;
    name: string;
  }>;
  documentRows: Array<{
    document_type: string;
    file_name: string | null;
    raw_extraction: string | null;
    summary: string | null;
  }>;
  email: Email | null;
  estimateAccountLookupCount: number;
  estimateAccountRows: Array<{ account_id: number | null }>;
  estimateMatchResult: EstimateCandidateResult | null;
  estimateProjectRows: Array<{
    estimate_id: number;
    project_count: number;
    project_id: number | null;
  }>;
  projectAccountRow: { account_id: number | null } | null;
  projectMatchInputs: Record<string, unknown>[];
  projectMatchResult: {
    candidates: Array<{
      address: string | null;
      contractor: string | null;
      name: string;
      projectId: number;
      score: number;
    }>;
  } | null;
  queryLog: string[];
  threadRows: Array<{
    body_preview: string | null;
    classification: string | null;
    from_email: string | null;
    from_name: string | null;
    project_id: number | null;
    received_at: string;
    subject: string | null;
  }>;
}

const state: MockState = {
  email: null,
  estimateAccountLookupCount: 0,
  estimateAccountRows: [],
  estimateMatchResult: null,
  estimateProjectRows: [],
  projectAccountRow: null,
  projectMatchInputs: [],
  projectMatchResult: null,
  queryLog: [],
  threadRows: [],
  documentRows: [],
  attachmentRows: [],
};

function buildEmail(overrides: Partial<Email>): Email {
  const now = new Date("2026-02-20T10:00:00.000Z").toISOString();
  return {
    id: 777,
    messageId: "msg-777",
    internetMessageId: null,
    mailboxId: 1,
    conversationId: "conv-777",
    subject: "FW: Ironwood Site - contract packet",
    normalizedSubject: "Ironwood Site - contract packet",
    fromEmail: "pm@builder.example.com",
    fromName: "Project Manager",
    fromDomain: "builder.example.com",
    toEmails: ["ops@desertservices.net"],
    ccEmails: [],
    receivedAt: now,
    hasAttachments: true,
    attachmentNames: ["Ironwood-Site-Proposal.pdf", "site-map.PNG"],
    bodyPreview: "See attached.",
    bodyFull: "Please review Ironwood Site docs and address details.",
    bodyHtml: null,
    webUrl: null,
    categories: [],
    classification: null,
    classificationConfidence: null,
    classificationMethod: null,
    projectName: null,
    contractorName: null,
    mondayEstimateId: null,
    notionProjectId: null,
    accountId: null,
    projectId: null,
    threadId: null,
    isInternal: false,
    isForwarded: true,
    originalSenderEmail: null,
    originalSenderDomain: null,
    isPlatformEmail: false,
    platformName: null,
    realSenderName: null,
    realSenderCompany: null,
    realSenderEmail: null,
    realSenderDomain: null,
    isExcluded: false,
    bodyLinkScanStatus: null,
    bodyLinkScannedAt: null,
    bodyLinkScanError: null,
    bodyLinkScanLinksFound: 0,
    bodyLinkScanAttachmentsAdded: 0,
    bodyLinkScanAttempts: 0,
    bodyLinkScanVersion: 0,
    createdAt: now,
    ...overrides,
  };
}

mock.module("@lib/db/client", () => ({
  db: {
    query: (sql: string) => {
      state.queryLog.push(sql);
      return {
        all: () => {
          if (sql.includes("FROM project_estimates")) {
            return state.estimateProjectRows;
          }
          if (
            sql.includes("SELECT DISTINCT account_id") &&
            sql.includes("FROM estimates")
          ) {
            state.estimateAccountLookupCount += 1;
            return state.estimateAccountRows;
          }
          if (
            sql.includes("FROM emails") &&
            sql.includes("conversation_id = $1") &&
            sql.includes("id != $2")
          ) {
            return state.threadRows;
          }
          if (
            sql.includes("FROM documents d") &&
            sql.includes("d.raw_extraction")
          ) {
            return state.documentRows;
          }
          if (
            sql.includes("FROM documents d") &&
            sql.includes("d.source = 'email_attachment'")
          ) {
            return state.attachmentRows;
          }
          throw new Error(`Unhandled all() query: ${sql}`);
        },
        get: () => {
          if (sql.includes("SELECT account_id FROM projects WHERE id = $1")) {
            return state.projectAccountRow;
          }
          throw new Error(`Unhandled get() query: ${sql}`);
        },
      };
    },
  },
}));

mock.module("@lib/db/repositories/email", () => ({
  getEmailById: async () => state.email,
}));

mock.module("@lib/db/repositories/estimate-email-matching", () => ({
  findEstimateCandidatesForEmail: async () => state.estimateMatchResult,
}));

mock.module("@lib/db/repositories/project-matching", () => ({
  findProjectCandidates: (input: Record<string, unknown>) => {
    state.projectMatchInputs.push(input);
    return state.projectMatchResult;
  },
}));

const { gatherTriageContext } = await import("@lib/triage/context");

describe("gatherTriageContext candidate assembly", () => {
  beforeEach(() => {
    state.email = null;
    state.estimateAccountLookupCount = 0;
    state.estimateAccountRows = [];
    state.estimateMatchResult = null;
    state.estimateProjectRows = [];
    state.projectAccountRow = null;
    state.projectMatchInputs = [];
    state.projectMatchResult = null;
    state.queryLog = [];
    state.threadRows = [];
    state.documentRows = [];
    state.attachmentRows = [];
  });

  test("uses expanded hints and maps estimate->project only when unambiguous", async () => {
    state.email = buildEmail({
      accountId: null,
      projectId: null,
      subject: "FW: Ironwood Site - contract packet",
    });

    state.threadRows = [
      {
        body_preview: "Kickoff scheduling",
        classification: "SCHEDULE",
        from_email: "pm@builder.example.com",
        from_name: "Project Manager",
        project_id: null,
        received_at: "2026-02-19T10:00:00.000Z",
        subject: "Re: Ironwood Site kickoff",
      },
    ];

    state.documentRows = [
      {
        document_type: "contract",
        summary: "Ironwood Site contract packet",
        file_name: "ironwood_contract.pdf",
        raw_extraction: JSON.stringify({
          project_name: "Ironwood Site",
          site_address: "123 Main St, Phoenix AZ",
          irrelevant_flag: "ignored",
        }),
      },
    ];

    state.attachmentRows = [
      {
        name: "schedule-v2.docx",
        content_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extracted_text: "schedule",
      },
    ];

    state.estimateMatchResult = {
      context: {
        emailId: 777,
        subject: "",
        bodyPreview: "",
        attachmentNames: [],
        fromDomain: null,
        contractorHints: [],
        projectHints: [],
        addressHints: [],
        estimateReferenceHints: [],
        mondayItemHints: [],
        queryHints: [],
      },
      candidates: [
        {
          estimateId: 101,
          estimateNumber: "7654321",
          mondayItemId: null,
          name: "Ironwood Site Estimate",
          jobName: "Ironwood Site",
          contractor: "Builder Co",
          jobAddress: "123 Main St, Phoenix AZ",
          location: null,
          accountDomain: null,
          bidStatus: null,
          updatedAt: "2026-02-18T10:00:00.000Z",
          score: 350,
          confidence: 0.9,
          reasons: [],
        },
        {
          estimateId: 202,
          estimateNumber: "8888888",
          mondayItemId: null,
          name: "Ambiguous Estimate",
          jobName: "Another Site",
          contractor: "Builder Co",
          jobAddress: "999 North Rd",
          location: null,
          accountDomain: null,
          bidStatus: null,
          updatedAt: "2026-02-18T10:00:00.000Z",
          score: 120,
          confidence: 0.3,
          reasons: [],
        },
      ],
      decision: {
        best: null,
        runnerUp: null,
        autoLink: false,
        gap: 0,
        reason: "manual_review_required",
        thresholds: { minScore: 0, minGap: 0 },
      },
    };

    state.estimateProjectRows = [
      {
        estimate_id: 101,
        project_id: 501,
        project_count: 1,
      },
      {
        estimate_id: 202,
        project_id: 777,
        project_count: 2,
      },
    ];

    state.estimateAccountRows = [{ account_id: 77 }];

    state.projectMatchResult = {
      candidates: [
        {
          projectId: 501,
          name: "Ironwood Site",
          contractor: "Builder Co",
          address: "123 Main St, Phoenix AZ",
          score: 420,
        },
      ],
    };

    const context = await gatherTriageContext(777, "ops@desertservices.net");

    expect(context).toBeTruthy();
    expect(state.projectMatchInputs).toHaveLength(1);

    const projectInput = state.projectMatchInputs[0];
    expect(projectInput?.accountIdHint).toBe(77);
    expect(projectInput?.contractorHint).toBe("builder.example.com");
    expect(projectInput?.addressHint).toBe("123 Main St, Phoenix AZ");

    const aliasHints = (projectInput?.aliasHints ?? []) as string[];
    expect(aliasHints).toContain("FW: Ironwood Site - contract packet");
    expect(aliasHints).toContain("Ironwood Site contract packet");
    expect(aliasHints).toContain("Re: Ironwood Site kickoff");
    expect(aliasHints).toContain("Ironwood-Site-Proposal");
    expect(aliasHints).toContain("schedule-v2");

    const estimates = context?.candidates.estimates ?? [];
    expect(estimates).toHaveLength(2);
    expect(estimates[0]?.projectId).toBe(501);
    expect(estimates[1]?.projectId).toBeNull();
  });

  test("prefers email.accountId and skips estimate-account fallback query", async () => {
    state.email = buildEmail({
      accountId: 999,
      subject: null,
      bodyFull: "Body-only signal for North Yard project",
    });

    state.estimateMatchResult = {
      context: {
        emailId: 777,
        subject: "",
        bodyPreview: "",
        attachmentNames: [],
        fromDomain: null,
        contractorHints: [],
        projectHints: [],
        addressHints: [],
        estimateReferenceHints: [],
        mondayItemHints: [],
        queryHints: [],
      },
      candidates: [
        {
          estimateId: 303,
          estimateNumber: "9999999",
          mondayItemId: null,
          name: "North Yard",
          jobName: "North Yard",
          contractor: null,
          jobAddress: null,
          location: null,
          accountDomain: null,
          bidStatus: null,
          updatedAt: "2026-02-18T10:00:00.000Z",
          score: 90,
          confidence: 0.5,
          reasons: [],
        },
      ],
      decision: {
        best: null,
        runnerUp: null,
        autoLink: false,
        gap: 0,
        reason: "manual_review_required",
        thresholds: { minScore: 0, minGap: 0 },
      },
    };

    state.estimateProjectRows = [
      {
        estimate_id: 303,
        project_id: 909,
        project_count: 1,
      },
    ];

    state.estimateAccountRows = [{ account_id: 1234 }];

    state.projectMatchResult = {
      candidates: [
        {
          projectId: 909,
          name: "North Yard",
          contractor: null,
          address: null,
          score: 80,
        },
      ],
    };

    const context = await gatherTriageContext(777, "ops@desertservices.net");

    expect(context).toBeTruthy();
    expect(state.projectMatchInputs).toHaveLength(1);

    const projectInput = state.projectMatchInputs[0];
    expect(projectInput?.accountIdHint).toBe(999);
    expect(projectInput?.primaryText).toBe(
      "Body-only signal for North Yard project"
    );
    expect(state.estimateAccountLookupCount).toBe(0);
  });
});
