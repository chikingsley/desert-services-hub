"use client";

import { clearLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { signOut } from "@/utils/auth-client";

export async function logOut(callbackUrl?: string) {
  clearLastEmailAccountAction();

  await signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = callbackUrl || "/";
      },
      onError: () => {
        window.location.href = callbackUrl || "/";
      },
    },
  });
}
