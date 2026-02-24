import { exchangeGoogleDriveCode } from "@/utils/drive/client";
import { handleDriveCallback } from "@/utils/drive/handle-drive-callback";
import { withError } from "@/utils/middleware";

export const GET = withError("google/drive/callback", async (request) => {
  return handleDriveCallback(
    request,
    {
      name: "google",
      exchangeCodeForTokens: exchangeGoogleDriveCode,
    },
    request.logger
  );
});
