import { exchangeMicrosoftDriveCode } from "@/utils/drive/client";
import { handleDriveCallback } from "@/utils/drive/handle-drive-callback";
import { withError } from "@/utils/middleware";

export const GET = withError("outlook/drive/callback", async (request) => {
  return handleDriveCallback(
    request,
    {
      name: "microsoft",
      exchangeCodeForTokens: exchangeMicrosoftDriveCode,
    },
    request.logger
  );
});
