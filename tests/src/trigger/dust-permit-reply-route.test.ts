import { afterEach, describe, expect, mock, test } from "bun:test";

const triggerCalls: Array<{ payload: Record<string, unknown>; task: string }> = [];

let mockQueryGet: (sql: string, params: unknown[]) => Promise<unknown> = async () =>
  null;
let mockQueryAll: (sql: string, params: unknown[]) => Promise<unknown[]> = async () =>
  [];

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

describe("dust permit reply route task", () => {
  afterEach(() => {
    triggerCalls.length = 0;
    mockQueryGet = async () => null;
    mockQueryAll = async () => [];
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
});
