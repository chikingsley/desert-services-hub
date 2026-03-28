import { DESERT_SERVICES_LOGO_BASE64 } from "../../../../trigger-dev/src/trigger/email-notifications/helpers/desert-services-logo";

export const LOGO_ATTACHMENT = {
  contentBytesBase64: DESERT_SERVICES_LOGO_BASE64,
  contentId: "logo",
  contentType: "image/png",
  isInline: true,
  name: "desert-services-logo.png",
} as const;
