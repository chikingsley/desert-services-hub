import type { Browser } from "@cloudflare/playwright";

import { type CreateFlow, ensureLoggedIn, openMyDustApps, runMinimalCreate } from "./create";
import {
  deleteAllDrafts,
  deleteDraftByApplicationId,
  type DeleteDraftsResult,
} from "./delete";
import { launchPortalPage, type PortalEnv } from "./portal-shared";

const readJsonBody = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const getString = (
  body: Record<string, unknown> | null,
  key: string
): string | null => {
  if (!body) {
    return null;
  }

  const value = body[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

const getCreateFlow = (value: string | null): CreateFlow["flow"] =>
  value === "existing-company" ? "existing-company" : "new-company";

const getDeleteFailureStatus = (result: DeleteDraftsResult): number => {
  switch (result.code) {
    case "navigate_failed": {
      return 500;
    }
    case "not_found": {
      return 404;
    }
    default: {
      return 422;
    }
  }
};

const getPortalCredentials = (
  env: PortalEnv
): { password: string; username: string } | null => {
  const username = env.DUST_PERMIT_USERNAME?.trim();
  const password = env.DUST_PERMIT_PASSWORD?.trim();
  if (!username || !password) {
    return null;
  }

  return { password, username };
};

export const handleMaricopaCreatePost = async (
  request: Request,
  env: PortalEnv
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed", success: false },
      { status: 405 }
    );
  }

  if (!env.BROWSER) {
    return Response.json(
      { error: "BROWSER binding is not configured", success: false },
      { status: 500 }
    );
  }

  const credentials = getPortalCredentials(env);
  if (!credentials) {
    return Response.json(
      {
        error:
          "Missing DUST_PERMIT_USERNAME and/or DUST_PERMIT_PASSWORD environment variables",
        success: false,
      },
      { status: 400 }
    );
  }

  const body = await readJsonBody(request);
  const options: CreateFlow = {
    companyName: getString(body, "companyName") ?? undefined,
    copyFromApp: getString(body, "copyFromApp") ?? undefined,
    flow: getCreateFlow(getString(body, "flow")),
  };

  let browser: Browser | null = null;
  try {
    const launched = await launchPortalPage(env);
    browser = launched.browser;

    if (!(await ensureLoggedIn(launched.page, credentials.username, credentials.password))) {
      return Response.json(
        { error: "Login failed", success: false },
        { status: 401 }
      );
    }

    if (!(await openMyDustApps(launched.page))) {
      return Response.json(
        {
          error: "Could not reach My Dust Apps after login",
          success: false,
        },
        { status: 500 }
      );
    }

    const result = await runMinimalCreate(launched.page, options);
    if (!result.permitId) {
      return Response.json(
        { error: result.error, success: false },
        { status: 422 }
      );
    }

    return Response.json({
      applicationId: result.permitId,
      permitId: result.permitId,
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        success: false,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // Ignore teardown errors.
      });
    }
  }
};

export const handleMaricopaDeletePost = async (
  request: Request,
  env: PortalEnv
): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed", success: false },
      { status: 405 }
    );
  }

  if (!env.BROWSER) {
    return Response.json(
      { error: "BROWSER binding is not configured", success: false },
      { status: 500 }
    );
  }

  const credentials = getPortalCredentials(env);
  if (!credentials) {
    return Response.json(
      {
        error:
          "Missing DUST_PERMIT_USERNAME and/or DUST_PERMIT_PASSWORD environment variables",
        success: false,
      },
      { status: 400 }
    );
  }

  const body = await readJsonBody(request);
  const applicationId = getString(body, "applicationId");

  let browser: Browser | null = null;
  try {
    const launched = await launchPortalPage(env);
    browser = launched.browser;

    if (!(await ensureLoggedIn(launched.page, credentials.username, credentials.password))) {
      return Response.json(
        { error: "Login failed", success: false },
        { status: 401 }
      );
    }

    const result = applicationId
      ? await deleteDraftByApplicationId(
          launched.page,
          launched.page.context(),
          applicationId
        )
      : await deleteAllDrafts(launched.page, launched.page.context());

    if (!result.success) {
      return Response.json(
        {
          ...result,
          applicationId: applicationId ?? null,
          success: false,
        },
        { status: getDeleteFailureStatus(result) }
      );
    }

    return Response.json({
      ...result,
      applicationId: applicationId ?? null,
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        success: false,
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {
        // Ignore teardown errors.
      });
    }
  }
};
