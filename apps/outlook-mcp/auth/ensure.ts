/**
 * Ensures the user is authenticated and returns an access token
 */
import tokenManager from "@outlook/auth/token-manager";

export async function ensureAuthenticated(forceNew = false): Promise<string> {
  if (forceNew) {
    throw new Error("Authentication required");
  }

  const accessToken = await tokenManager.getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required");
  }

  return accessToken;
}
