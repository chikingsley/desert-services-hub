"use server";

import { revalidatePath } from "next/cache";
import { actionClientUser } from "@/utils/actions/safe-action";
import { clearUserErrorMessages } from "@/utils/error-messages";

export const clearUserErrorMessagesAction = actionClientUser
  .metadata({ name: "clearUserErrorMessages" })
  .action(async ({ ctx: { userId, logger } }) => {
    await clearUserErrorMessages({ userId, logger });
    revalidatePath("/(app)", "layout");
  });
