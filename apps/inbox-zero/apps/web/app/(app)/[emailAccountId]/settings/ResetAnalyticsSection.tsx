"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { resetAnalyticsAction } from "@/utils/actions/user";

export function ResetAnalyticsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { executeAsync: executeResetAnalytics } = useAction(
    resetAnalyticsAction.bind(null, emailAccountId)
  );

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Reset Analytics</ItemTitle>
          <ItemDescription>Permanently delete all analytics</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            onClick={async () => {
              toast.promise(() => executeResetAnalytics(), {
                loading: "Resetting analytics...",
                success: () => {
                  return "Analytics reset! Visit the Unsubscriber or Analytics page and click the 'Load More' button to reload your data.";
                },
                error: (err) => {
                  return `Error resetting analytics: ${err.message}`;
                },
              });
            }}
            size="sm"
            variant="outline"
          >
            Reset
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}
