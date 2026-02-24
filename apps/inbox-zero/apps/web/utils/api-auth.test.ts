import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { hashApiKey } from "@/utils/api-key";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import type { RequestWithLogger } from "@/utils/middleware";
import {
  getUserFromApiKey,
  validateApiKey,
  validateApiKeyAndGetEmailProvider,
} from "./api-auth";

// Mock dependencies
vi.mock("@/utils/prisma");
vi.mock("@/utils/api-key");
vi.mock("@/utils/gmail/client");
vi.mock("server-only", () => ({}));

// Create a type that matches what our test expects to be returned from prisma.apiKey.findUnique
type MockApiKeyResult = {
  user: {
    id: string;
    accounts: Array<any>;
  };
  isActive: boolean;
};

const logger = createScopedLogger("api-auth-test");

function createMockRequest(apiKey: string | null): RequestWithLogger {
  return {
    headers: {
      get: vi.fn().mockReturnValue(apiKey),
    },
    logger,
  } as unknown as RequestWithLogger;
}

describe("api-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateApiKey", () => {
    it("should throw an error if API key is missing", async () => {
      const request = createMockRequest(null);

      await expect(validateApiKey(request)).rejects.toThrow(SafeError);
      await expect(validateApiKey(request)).rejects.toThrow("Missing API key");
    });

    it("should throw an error if API key is invalid", async () => {
      const request = createMockRequest("test-api-key");

      // Mock getUserFromApiKey to return null (invalid API key)
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(validateApiKey(request)).rejects.toThrow(SafeError);
      await expect(validateApiKey(request)).rejects.toThrow("Invalid API key");
    });

    it("should return user if API key is valid", async () => {
      const request = createMockRequest("valid-api-key");

      // Mock getUserFromApiKey to return a user
      const mockUser = {
        id: "user-id",
        accounts: [],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      const result = await validateApiKey(request);
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe("getUserFromApiKey", () => {
    it("should return null if API key is not found", async () => {
      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      prisma.apiKey.findUnique.mockResolvedValue(null);

      const result = await getUserFromApiKey("invalid-key");
      expect(result).toBeNull();
    });

    it("should return user if API key is valid", async () => {
      const mockUser = {
        id: "user-id",
        accounts: [],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      const result = await getUserFromApiKey("valid-key");
      expect(result).toEqual(mockUser);
    });
  });

  describe("validateApiKeyAndGetGmailClient", () => {
    it("should throw an error if API key is invalid", async () => {
      const request = createMockRequest(null);

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        SafeError
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Missing API key"
      );
    });

    it("should throw an error if user has no Google account", async () => {
      const request = createMockRequest("valid-api-key");

      const mockUser = {
        id: "user-id",
        accounts: [], // Empty accounts array
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        SafeError
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Missing account"
      );
    });

    it("should throw an error if account is missing tokens", async () => {
      const request = createMockRequest("valid-api-key");

      const mockUser = {
        id: "user-id",
        accounts: [
          {
            // Missing tokens
            providerAccountId: "google-account-id",
          },
        ],
      };

      vi.mocked(hashApiKey).mockReturnValue("hashed-key");
      (prisma.apiKey.findUnique as any).mockResolvedValue({
        user: mockUser,
        isActive: true,
      } as MockApiKeyResult);

      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        SafeError
      );
      await expect(validateApiKeyAndGetEmailProvider(request)).rejects.toThrow(
        "Missing access token"
      );
    });
  });
});
