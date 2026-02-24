import { NextResponse } from "next/server";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { withEmailAccount } from "@/utils/middleware";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";
import { getCalendarOAuth2Url } from "@/utils/outlook/calendar-client";

export type GetCalendarAuthUrlResponse = { url: string };

const getAuthUrl = ({ emailAccountId }: { emailAccountId: string }) => {
  const state = generateOAuthState({
    emailAccountId,
    type: "calendar",
  });

  const url = getCalendarOAuth2Url(state);

  return { url, state };
};

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;
  const { url, state } = getAuthUrl({ emailAccountId });

  const res: GetCalendarAuthUrlResponse = { url };
  const response = NextResponse.json(res);

  response.cookies.set(
    CALENDAR_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions
  );

  return response;
});
