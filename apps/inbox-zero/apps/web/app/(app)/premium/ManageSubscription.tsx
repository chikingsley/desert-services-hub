"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ManageSubscription(_props: {
  premium: {
    stripeSubscriptionId: string | null | undefined;
    lemonSqueezyCustomerId: number | null | undefined;
  };
}) {
  return (
    <Button asChild variant="outline">
      <Link href="/settings">Billing disabled</Link>
    </Button>
  );
}
