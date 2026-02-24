import { handleCalendarCallback } from "@/utils/calendar/handle-calendar-callback";
import { createGoogleCalendarProvider } from "@/utils/calendar/providers/google";
import { withError } from "@/utils/middleware";

export const GET = withError("google/calendar/callback", async (request) => {
  return handleCalendarCallback(
    request,
    createGoogleCalendarProvider(request.logger),
    request.logger
  );
});
