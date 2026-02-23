import path from "node:path";

export interface TokenStorageConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshTokenBuffer: number;
  scopes: string[];
  tokenEndpoint: string;
  tokenStorePath: string;
}

export interface Tokens {
  access_token: string;
  expires_at?: number;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface TokenResponse {
  access_token?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

class TokenStorage {
  config: TokenStorageConfig;
  tokens: Tokens | null;
  private _loadPromise: Promise<Tokens | null> | null;
  private _refreshPromise: Promise<Tokens> | null;

  constructor(config?: Partial<TokenStorageConfig>) {
    this.config = {
      tokenStorePath: path.join(
        process.env.HOME || process.env.USERPROFILE || "",
        ".outlook-mcp-tokens.json"
      ),
      clientId: process.env.MS_CLIENT_ID || "",
      clientSecret: process.env.MS_CLIENT_SECRET || "",
      redirectUri:
        process.env.MS_REDIRECT_URI || "http://localhost:3333/auth/callback",
      scopes: (
        process.env.MS_SCOPES || "offline_access User.Read Mail.Read"
      ).split(" "),
      tokenEndpoint:
        process.env.MS_TOKEN_ENDPOINT ||
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      refreshTokenBuffer: 5 * 60 * 1000, // 5 minutes buffer for token refresh
      ...config,
    };
    this.tokens = null;
    this._loadPromise = null;
    this._refreshPromise = null;

    if (!(this.config.clientId && this.config.clientSecret)) {
      console.warn(
        "TokenStorage: MS_CLIENT_ID or MS_CLIENT_SECRET is not configured. Token operations might fail."
      );
    }
  }

  async _loadTokensFromFile(): Promise<Tokens | null> {
    try {
      const file = Bun.file(this.config.tokenStorePath);
      if (await file.exists()) {
        const content = await file.text();
        this.tokens = JSON.parse(content) as Tokens;
        console.log("Tokens loaded from file.");
        return this.tokens;
      }
      console.log("Token file not found. No tokens loaded.");
      this.tokens = null;
      return null;
    } catch (error) {
      console.error("Error loading token cache:", error);
      this.tokens = null;
      return null;
    }
  }

  async _saveTokensToFile(): Promise<void> {
    if (!this.tokens) {
      console.warn("No tokens to save.");
      return;
    }
    try {
      await Bun.write(
        this.config.tokenStorePath,
        JSON.stringify(this.tokens, null, 2)
      );
      console.log("Tokens saved successfully.");
    } catch (error) {
      console.error("Error saving token cache:", error);
      throw error;
    }
  }

  getTokens(): Promise<Tokens | null> | Tokens | null {
    if (this.tokens) {
      return this.tokens;
    }
    if (!this._loadPromise) {
      this._loadPromise = this._loadTokensFromFile().finally(() => {
        this._loadPromise = null;
      });
    }
    return this._loadPromise;
  }

  getExpiryTime(): number {
    return this.tokens?.expires_at ?? 0;
  }

  isTokenExpired(): boolean {
    if (!this.tokens?.expires_at) {
      return true;
    }
    return (
      Date.now() >= this.tokens.expires_at - this.config.refreshTokenBuffer
    );
  }

  async getValidAccessToken(): Promise<string | null> {
    await this.getTokens();

    if (!this.tokens?.access_token) {
      console.log("No access token available.");
      return null;
    }

    if (this.isTokenExpired()) {
      console.log(
        "Access token expired or nearing expiration. Attempting refresh."
      );
      if (this.tokens.refresh_token) {
        try {
          return await this.refreshAccessToken();
        } catch (refreshError) {
          console.error("Failed to refresh access token:", refreshError);
          this.tokens = null;
          await this._saveTokensToFile();
          return null;
        }
      }
      console.warn("No refresh token available. Cannot refresh access token.");
      this.tokens = null;
      await this._saveTokensToFile();
      return null;
    }
    return this.tokens.access_token;
  }

  async refreshAccessToken(): Promise<string> {
    if (!this.tokens?.refresh_token) {
      throw new Error(
        "No refresh token available to refresh the access token."
      );
    }

    if (this._refreshPromise) {
      console.log("Refresh already in progress, returning existing promise.");
      const tokens = await this._refreshPromise;
      return tokens.access_token;
    }

    console.log("Attempting to refresh access token...");

    this._refreshPromise = (async (): Promise<Tokens> => {
      try {
        const response = await fetch(this.config.tokenEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            grant_type: "refresh_token",
            refresh_token: this.tokens?.refresh_token || "",
            scope: this.config.scopes.join(" "),
          }),
        });

        const responseBody = (await response.json()) as TokenResponse;

        if (response.ok) {
          if (!this.tokens) {
            this.tokens = { access_token: "" };
          }
          this.tokens.access_token = responseBody.access_token || "";
          if (responseBody.refresh_token) {
            this.tokens.refresh_token = responseBody.refresh_token;
          }
          this.tokens.expires_in = responseBody.expires_in;
          this.tokens.expires_at =
            Date.now() + (responseBody.expires_in || 0) * 1000;

          try {
            await this._saveTokensToFile();
            console.log("Access token refreshed and saved successfully.");
            return this.tokens;
          } catch (saveError) {
            console.error("Failed to save refreshed tokens:", saveError);
            throw new Error(
              `Access token refreshed but failed to save: ${(saveError as Error).message}`
            );
          }
        }

        console.error("Error refreshing token:", responseBody);
        throw new Error(
          responseBody.error_description ||
            `Token refresh failed with status ${response.status}`
        );
      } finally {
        this._refreshPromise = null;
      }
    })();

    const tokens = await this._refreshPromise;
    return tokens.access_token;
  }

  async exchangeCodeForTokens(authCode: string): Promise<Tokens> {
    if (!(this.config.clientId && this.config.clientSecret)) {
      throw new Error(
        "Client ID or Client Secret is not configured. Cannot exchange code for tokens."
      );
    }
    console.log("Exchanging authorization code for tokens...");

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: this.config.redirectUri,
        scope: this.config.scopes.join(" "),
      }),
    });

    let responseBody: TokenResponse;
    const responseText = await response.text();

    try {
      responseBody = JSON.parse(responseText) as TokenResponse;
    } catch {
      console.error("Error processing token exchange response:", responseText);
      throw new Error(
        `Error processing token response. Response data: ${responseText}`
      );
    }

    if (response.ok) {
      this.tokens = {
        access_token: responseBody.access_token || "",
        refresh_token: responseBody.refresh_token,
        expires_in: responseBody.expires_in,
        expires_at: Date.now() + (responseBody.expires_in || 0) * 1000,
        scope: responseBody.scope,
        token_type: responseBody.token_type,
      };

      try {
        await this._saveTokensToFile();
        console.log("Tokens exchanged and saved successfully.");
        return this.tokens;
      } catch (saveError) {
        console.error("Failed to save exchanged tokens:", saveError);
        throw new Error(
          `Tokens exchanged but failed to save: ${(saveError as Error).message}`
        );
      }
    }

    console.error("Error exchanging code for tokens:", responseBody);
    throw new Error(
      responseBody.error_description ||
        `Token exchange failed with status ${response.status}`
    );
  }

  async clearTokens(): Promise<void> {
    this.tokens = null;
    try {
      const file = Bun.file(this.config.tokenStorePath);
      if (await file.exists()) {
        const { unlink } = await import("node:fs/promises");
        await unlink(this.config.tokenStorePath);
        console.log("Token file deleted successfully.");
      } else {
        console.log("Token file not found, nothing to delete.");
      }
    } catch (error) {
      console.error("Error deleting token file:", error);
    }
  }
}

export default TokenStorage;
