"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import {
  type ChangePremiumStatusOptions,
  changePremiumStatusSchema,
} from "@/app/(app)/admin/validation";
import { tiers } from "@/app/(app)/premium/config";
import { Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PremiumTier } from "@/generated/prisma/enums";
import { cn } from "@/utils";
import { adminChangePremiumStatusAction } from "@/utils/actions/premium";

type TierKey = "STARTER" | "PLUS" | "PROFESSIONAL" | "LIFETIME";

const tierOptions: { key: TierKey; name: string; features: string }[] = [
  ...tiers.map((t) => ({
    key: t.tiers.annually.replace("_ANNUALLY", "") as TierKey,
    name: t.name,
    features: t.features.map((f) => f.text).join(", "),
  })),
  { key: "LIFETIME", name: "Lifetime", features: "One-time purchase" },
];

function buildPremiumTier(
  tierKey: TierKey,
  billingPeriod: "MONTHLY" | "ANNUALLY"
): PremiumTier {
  if (tierKey === "LIFETIME") {
    return "LIFETIME";
  }
  return `${tierKey}_${billingPeriod}` as PremiumTier;
}

export const AdminUpgradeUserForm = () => {
  const [selectedTier, setSelectedTier] = useState<TierKey>("STARTER");
  const [billingPeriod, setBillingPeriod] = useState<"MONTHLY" | "ANNUALLY">(
    "ANNUALLY"
  );

  const { execute: changePremiumStatus, isExecuting } = useAction(
    adminChangePremiumStatusAction,
    {
      onSuccess: () => {
        toastSuccess({ description: "Premium status changed" });
      },
      onError: ({ error }) => {
        toastError({
          description: `Error changing premium status: ${error.serverError}`,
        });
      },
    }
  );

  const {
    register,
    formState: { errors },
    getValues,
  } = useForm<ChangePremiumStatusOptions>({
    resolver: zodResolver(changePremiumStatusSchema),
    defaultValues: {
      period: "STARTER_ANNUALLY",
    },
  });

  const onSubmit: SubmitHandler<ChangePremiumStatusOptions> = useCallback(
    (data) => {
      changePremiumStatus({
        ...data,
        count: data.count || 1,
        lemonSqueezyCustomerId: data.lemonSqueezyCustomerId || undefined,
        emailAccountsAccess: data.emailAccountsAccess || undefined,
      });
    },
    [changePremiumStatus]
  );

  const period = buildPremiumTier(selectedTier, billingPeriod);

  return (
    <form className="max-w-sm space-y-4">
      <Input
        error={errors.email}
        label="Email"
        name="email"
        registerProps={register("email", { required: true })}
        type="email"
      />
      <Input
        error={errors.lemonSqueezyCustomerId}
        label="Lemon Squeezy Customer Id"
        name="lemonSqueezyCustomerId"
        registerProps={register("lemonSqueezyCustomerId", {
          valueAsNumber: true,
        })}
        type="number"
      />
      <Input
        error={errors.emailAccountsAccess}
        label="Seats"
        name="emailAccountsAccess"
        registerProps={register("emailAccountsAccess", { valueAsNumber: true })}
        type="number"
      />

      <div>
        <Label label="Plan" name="plan" />
        <Select
          onValueChange={(v) => setSelectedTier(v as TierKey)}
          value={selectedTier}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tierOptions.map((tier) => (
              <SelectPrimitive.Item
                className="relative flex w-full cursor-default select-none items-start rounded-sm py-2 pr-2 pl-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                key={tier.key}
                value={tier.key}
              >
                <span className="absolute top-2.5 left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <div>
                  <SelectPrimitive.ItemText>
                    {tier.name}
                  </SelectPrimitive.ItemText>
                  <div className="text-muted-foreground text-xs">
                    {tier.features}
                  </div>
                </div>
              </SelectPrimitive.Item>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTier !== "LIFETIME" && (
        <div>
          <Label label="Billing period" name="billingPeriod" />
          <div className="mt-1 flex gap-1 rounded-md border border-input p-1">
            {(["MONTHLY", "ANNUALLY"] as const).map((bp) => (
              <button
                className={cn(
                  "flex-1 rounded px-3 py-1.5 font-medium text-sm transition-colors",
                  billingPeriod === bp
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={bp}
                onClick={() => setBillingPeriod(bp)}
                type="button"
              >
                {bp === "MONTHLY" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </div>
      )}

      <Input
        error={errors.count}
        label="Months/Years"
        name="count"
        registerProps={register("count", { valueAsNumber: true })}
        type="number"
      />
      <div className="space-x-2">
        <Button
          loading={isExecuting}
          onClick={() => {
            onSubmit({
              email: getValues("email"),
              lemonSqueezyCustomerId: getValues("lemonSqueezyCustomerId"),
              emailAccountsAccess: getValues("emailAccountsAccess"),
              period,
              count: getValues("count"),
              upgrade: true,
            });
          }}
          type="button"
        >
          Upgrade
        </Button>
        <Button
          loading={isExecuting}
          onClick={() => {
            onSubmit({
              email: getValues("email"),
              period,
              count: getValues("count"),
              upgrade: false,
            });
          }}
          type="button"
          variant="destructive"
        >
          Downgrade
        </Button>
      </div>
    </form>
  );
};
