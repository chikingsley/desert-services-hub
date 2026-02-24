"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { usePremium } from "@/components/PremiumAlert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { deleteAccountAction } from "@/utils/actions/user";
import { logOut } from "@/utils/user";

export function DeleteSection() {
  const { onCancelLoadBatch } = useStatLoader();
  const { premium } = usePremium();

  const hasSubscription =
    premium?.stripeSubscriptionId || premium?.lemonSqueezySubscriptionId;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasConfirmedCancellation, setHasConfirmedCancellation] =
    useState(false);

  const { executeAsync: executeDeleteAccount } = useAction(
    deleteAccountAction.bind(null)
  );

  const handleDeleteAccount = async () => {
    onCancelLoadBatch();
    setIsDialogOpen(false);

    toast.promise(
      async () => {
        const result = await executeDeleteAccount();
        await logOut("/");
        if (result?.serverError) {
          throw new Error(result.serverError);
        }
      },
      {
        loading: "Deleting account...",
        success: "Account deleted!",
        error: (err) => `Error deleting account: ${err.message}`,
      }
    );
  };

  const handleConfirmCancellation = () => {
    setHasConfirmedCancellation(true);
  };

  const shouldBlockDeletion = hasSubscription && !hasConfirmedCancellation;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Delete account</ItemTitle>
        <ItemDescription>
          Permanently delete your account and all data.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <AlertDialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructiveSoft">
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {shouldBlockDeletion
                  ? "Cancel subscription first"
                  : "Are you absolutely sure?"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  {shouldBlockDeletion ? (
                    <>
                      <p className="mb-3">
                        Please cancel your subscription before deleting your
                        account.
                      </p>
                      <p className="mb-3">
                        You can manage your subscription by clicking "Manage
                        Subscription" above or going to the{" "}
                        <Link
                          className="text-blue-600 underline hover:text-blue-800"
                          href="/settings"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          settings page
                        </Link>{" "}
                        and clicking "Manage subscription".
                      </p>
                      <p className="text-gray-600 text-sm">
                        Already cancelled your subscription? Click the button
                        below to proceed.
                      </p>
                    </>
                  ) : (
                    <p>
                      This action cannot be undone. This will permanently delete
                      your user and all associated accounts.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {shouldBlockDeletion ? (
                <AlertDialogAction onClick={handleConfirmCancellation}>
                  I've already cancelled my subscription
                </AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={handleDeleteAccount}>
                  Delete account
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}
