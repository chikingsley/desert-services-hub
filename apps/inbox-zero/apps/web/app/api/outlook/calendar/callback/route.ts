import { handleCalendarCallback } from "@/utils/calendar/handle-calendar-callback";
import { createMicrosoftCalendarProvider } from "@/utils/calendar/providers/microsoft";
import { withError } from "@/utils/middleware";

export const GET = withError("outlook/calendar/callback", async (request) => {
  return handleCalendarCallback(
    request,
    createMicrosoftCalendarProvider(request.logger),
    request.logger
  );
});
