"use client";

import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { linkSlackWorkspaceAction } from "@/utils/actions/messaging-channels";
import { captureException, getActionErrorMessage } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";

export function useSlackConnect({
  emailAccountId,
  onConnected,
}: {
  emailAccountId: string;
  onConnected?: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const connectingRef = useRef(false);

  const { executeAsync: linkSlack } = useAction(
    linkSlackWorkspaceAction.bind(null, emailAccountId)
  );

  const connect = async () => {
    if (connecting || connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    setConnecting(true);
    try {
      const res = await fetchWithAccount({
        url: "/api/slack/auth-url",
        emailAccountId,
      });
      if (!res.ok) {
        throw new Error("Failed to get Slack auth URL");
      }
      const data: GetSlackAuthUrlResponse = await res.json();

      if (data.existingWorkspace) {
        const result = await linkSlack({
          teamId: data.existingWorkspace.teamId,
        });

        if (!(result?.serverError || result?.validationErrors)) {
          toastSuccess({ description: "Slack connected" });
          onConnected?.();
          return;
        }

        const linkError = getActionErrorMessage(
          {
            serverError: result?.serverError,
            validationErrors: result?.validationErrors,
          },
          "Failed to link Slack workspace"
        );

        if (linkError.includes("Could not find your Slack account")) {
          toastInfo({
            title: "Email not found in Slack",
            description: "Redirecting to Slack authorization...",
          });
        } else {
          toastInfo({
            title: "Continue in Slack",
            description: "Redirecting to Slack authorization...",
          });
        }
        // Always fall through to OAuth so the user isn't stuck.
      }

      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (error) {
      captureException(error, { extra: { context: "Slack connect" } });
      toastError({ description: "Failed to connect Slack" });
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  };

  return { connect, connecting };
}
