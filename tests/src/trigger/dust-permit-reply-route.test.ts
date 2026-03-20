import { afterEach, describe, expect, mock, test } from "bun:test";

const triggerCalls: Array<{ payload: Record<string, unknown>; task: string }> = [];

let mockQueryGet: (sql: string, params: unknown[]) => Promise<unknown> = async () =>
  null;
let mockQueryAll: (sql: string, params: unknown[]) => Promise<unknown[]> = async () =>
  [];
let mockGetEmailById: (id: number) => Promise<unknown> = async () => null;

mock.module("@trigger.dev/sdk", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  schemaTask: <T>(definition: T) => definition,
  tasks: {
    trigger: async (task: string, payload: Record<string, unknown>) => {
      triggerCalls.push({ payload, task });
      return { id: "run-123" };
    },
  },
}));

mock.module("@lib/db/client", () => ({
  db: {
    query: (sql: string) => ({
      get: (...params: unknown[]) => mockQueryGet(sql, params),
      all: (...params: unknown[]) => mockQueryAll(sql, params),
    }),
  },
}));

mock.module("@email/db/email", () => ({
  getEmailById: (id: number) => mockGetEmailById(id),
}));

describe("dust permit reply route task", () => {
  afterEach(() => {
    triggerCalls.length = 0;
    mockQueryGet = async () => null;
    mockQueryAll = async () => [];
    mockGetEmailById = async () => null;
  });

  test("routes to the existing permit notification task with replyToEmailId", async () => {
    mockQueryGet = async (sql: string) => {
      if (sql.includes("FROM dust_permits_filed_by_desert_services")) {
        return {
          id: "D0065310",
          project_name: "Commerce 303",
          company_name: "BPR Companies LLC",
        };
      }
      return null;
    };

    mockQueryAll = async (sql: string) => {
      if (sql.includes("FROM emails e")) {
        return [
          {
            body_text:
              "Will do Hayden Koning Project Manager ... From: Chi Ejimofor ... Subject: RE: Commerce 303 - BPR Companies || Dust Permit + LOI",
            cc_emails:
              '["Quenting@bprcompanies.com","vishk@bprcompanies.com","Jayson@desertservices.net"]',
            chi_email_id: 1180344,
            email_id: 1180344,
            from_email: "haydenk@bprcompanies.com",
            has_chi_copy: true,
            is_forwarded: 0,
            is_internal: 0,
            mailbox_email: "chi@desertservices.net",
            received_at: "2026-03-10T17:24:52.000Z",
            subject: "RE: Commerce 303 - BPR Companies || Dust Permit + LOI",
            to_emails: '["chi@desertservices.net"]',
          },
        ];
      }
      return [];
    };

    const cacheBuster = `dust-permit-reply-route-${Date.now()}-${Math.random()}`;
    const { dustPermitReplyRoute } = await import(
      `../../../apps/trigger-dev/src/trigger/dust-permit-reply-route.ts?${cacheBuster}`
    );

    const result = await (
      dustPermitReplyRoute as {
        run: (payload: {
          draft?: boolean;
          dryRun?: boolean;
          permitId: string;
          type: "issued";
        }) => Promise<Record<string, unknown>>;
      }
    ).run({
      permitId: "D0065310",
      type: "issued",
      draft: true,
      dryRun: false,
    });

    expect(result.route).toEqual({
      matchedRecipients: [
        "haydenk@bprcompanies.com",
        "quenting@bprcompanies.com",
        "vishk@bprcompanies.com",
      ],
      mode: "reply-all",
      reason: "selected external thread with chi mailbox copy",
      replyToEmailId: 1180344,
      selectedCandidateEmailId: 1180344,
    });

    expect(triggerCalls).toEqual([
      {
        payload: {
          cc: undefined,
          draft: true,
          permitId: "D0065310",
          replyToEmailId: 1180344,
          type: "issued",
        },
        task: "dust-permit-notification",
      },
    ]);
  });

  test("routes from a source email when permit search needs the source context", async () => {
    mockGetEmailById = async (id: number) => {
      if (id === 1202198) {
        return {
          bodyFull:
            "The Maricopa County Air Quality dust control permit application D0065403 has been processed and approved.\nFacility Name: GSQ Buildings B1-1, B1-2, & D1-2",
          bodyPreview: null,
          subject: "Dust Permit Issued",
        };
      }
      return null;
    };

    mockQueryGet = async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM dust_permits_filed_by_desert_services")) {
        return null;
      }
      if (sql.includes("FROM projects")) {
        return { id: 9001 };
      }
      return null;
    };

    mockQueryAll = async (sql: string) => {
      if (sql.includes("FROM emails e")) {
        return [
          {
            body_text:
              "Re: GSQ Buildings B1-1, B1-2, & D1-2 Dust Permit - FW: Dust and Miscellaneous Portal Submission Confirmation",
            cc_emails:
              '["cameronb@bprcompanies.com","henryr@bprcompanies.com"]',
            chi_email_id: 1206909,
            email_id: 1206909,
            from_email: "mikec@bprcompanies.com",
            has_chi_copy: true,
            is_forwarded: 0,
            is_internal: 0,
            mailbox_email: "chi@desertservices.net",
            received_at: "2026-03-18T20:15:51.000Z",
            subject:
              "RE: GSQ Buildings B1-1, B1-2, & D1-2 Dust Permit - FW: Dust and Miscellaneous Portal Submission Confirmation",
            to_emails: '["chi@desertservices.net","nickjc@bprcompanies.com"]',
          },
        ];
      }
      return [];
    };

    const cacheBuster = `dust-permit-reply-route-${Date.now()}-${Math.random()}`;
    const { dustPermitReplyRoute } = await import(
      `../../../apps/trigger-dev/src/trigger/dust-permit-reply-route.ts?${cacheBuster}`
    );

    const result = await (
      dustPermitReplyRoute as {
        run: (payload: {
          draft?: boolean;
          dryRun?: boolean;
          sourceEmailId: number;
          type: "issued";
        }) => Promise<Record<string, unknown>>;
      }
    ).run({
      sourceEmailId: 1202198,
      type: "issued",
      draft: true,
      dryRun: false,
    });

    expect(result.route).toEqual({
      matchedRecipients: [
        "mikec@bprcompanies.com",
        "nickjc@bprcompanies.com",
        "cameronb@bprcompanies.com",
        "henryr@bprcompanies.com",
      ],
      mode: "reply-all",
      reason: "selected external thread with chi mailbox copy",
      replyToEmailId: 1206909,
      selectedCandidateEmailId: 1206909,
    });

    expect(triggerCalls).toEqual([
      {
        payload: {
          cc: undefined,
          draft: true,
          permitId: "D0065403",
          replyToEmailId: 1206909,
          sourceEmailId: 1202198,
          type: "issued",
        },
        task: "dust-permit-notification",
      },
    ]);
  });
});
