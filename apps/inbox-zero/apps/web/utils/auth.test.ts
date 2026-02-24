import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { handleReferralOnSignUp, saveTokens } from "@/utils/auth";
import { clearSpecificErrorMessages } from "@/utils/error-messages";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/error-messages", () => ({
  addUserErrorMessage: vi.fn().mockResolvedValue(undefined),
  clearSpecificErrorMessages: vi.fn().mockResolvedValue(undefined),
  ErrorType: {
    ACCOUNT_DISCONNECTED: "Account disconnected",
  },
}));
vi.mock("@googleapis/people", () => ({
  people: vi.fn(),
}));
vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: vi.fn(),
  },
}));
vi.mock("@/utils/encryption", () => ({
  encryptToken: vi.fn((t) => t),
}));

describe("handleReferralOnSignUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op in the internal fork", async () => {
    await expect(
      handleReferralOnSignUp({ userId: "user123", email: "user@example.com" })
    ).resolves.toBeUndefined();
  });
});

describe("saveTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears disconnectedAt and error messages when saving tokens via emailAccountId", async () => {
    prisma.emailAccount.update.mockResolvedValue({ userId: "user_1" } as any);

    await saveTokens({
      emailAccountId: "ea_1",
      tokens: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_at: 123_456_789,
      },
      accountRefreshToken: null,
      provider: "google",
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ea_1" },
        data: expect.objectContaining({
          account: {
            update: expect.objectContaining({
              disconnectedAt: null,
            }),
          },
        }),
      })
    );
    expect(clearSpecificErrorMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        errorTypes: ["Account disconnected"],
      })
    );
  });

  it("clears disconnectedAt and error messages when saving tokens via providerAccountId", async () => {
    prisma.account.update.mockResolvedValue({ userId: "user_1" } as any);

    await saveTokens({
      providerAccountId: "pa_1",
      tokens: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_at: 123_456_789,
      },
      accountRefreshToken: null,
      provider: "google",
    });

    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "pa_1",
          },
        }),
        data: expect.objectContaining({
          disconnectedAt: null,
        }),
      })
    );
    expect(clearSpecificErrorMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        errorTypes: ["Account disconnected"],
      })
    );
  });
});
