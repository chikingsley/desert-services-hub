"use client";

import { RegenerateSecretButton } from "@/app/(app)/[emailAccountId]/settings/WebhookGenerate";
import { CopyInput } from "@/components/CopyInput";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { useUser } from "@/hooks/useUser";

export function WebhookSection() {
  const { data, isLoading, error, mutate } = useUser();

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Webhook Secret</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              View Secret
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook Secret</DialogTitle>
              <DialogDescription>
                Include this in the X-Webhook-Secret header when setting up
                webhook endpoints. Set webhook URLs for individual rules in
                Assistant &gt; Rules.
              </DialogDescription>
            </DialogHeader>
            <LoadingContent error={error} loading={isLoading}>
              {data && (
                <div className="space-y-4">
                  {!!data.webhookSecret && (
                    <CopyInput masked value={data.webhookSecret} />
                  )}
                  <RegenerateSecretButton
                    hasSecret={!!data.webhookSecret}
                    mutate={mutate}
                  />
                </div>
              )}
            </LoadingContent>
          </DialogContent>
        </Dialog>
      </ItemActions>
    </Item>
  );
}
