"use client";

import { useAction } from "next-safe-action/hooks";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  adminSyncAllStripeCustomersToDbAction,
  adminSyncStripeForAllUsersAction,
} from "@/utils/actions/admin";
import { getActionErrorMessage } from "@/utils/error";

export const AdminSyncStripe = () => {
  const { execute, isExecuting } = useAction(adminSyncStripeForAllUsersAction, {
    onSuccess: () => {
      toastSuccess({
        title: "Stripe synced",
        description: "Stripe synced",
      });
    },
    onError: (error) => {
      toastError({
        title: "Error syncing Stripe",
        description: getActionErrorMessage(error.error),
      });
    },
  });

  return (
    <Button loading={isExecuting} onClick={() => execute()} variant="outline">
      Sync Stripe
    </Button>
  );
};

export const AdminSyncStripeCustomers = () => {
  const { execute, isExecuting } = useAction(
    adminSyncAllStripeCustomersToDbAction,
    {
      onSuccess: (result) => {
        toastSuccess({
          title: "Stripe customers synced",
          description:
            result.data?.success || "All Stripe customers synced to database",
        });
      },
      onError: (error) => {
        toastError({
          title: "Error syncing Stripe customers",
          description: getActionErrorMessage(error.error),
        });
      },
    }
  );

  return (
    <Button loading={isExecuting} onClick={() => execute()} variant="outline">
      Sync All Stripe Customers to DB
    </Button>
  );
};
