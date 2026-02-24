"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { Select } from "@/components/Select";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Frequency } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateEmailSettingsAction } from "@/utils/actions/settings";
import {
  type SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/utils/actions/settings.validation";

export function EmailUpdatesSection({
  summaryEmailFrequency,
  mutate,
}: {
  summaryEmailFrequency: Frequency;
  mutate: () => void;
}) {
  return (
    <FormSection id="email-updates">
      <FormSectionLeft
        description="Get a weekly digest of items that need your attention."
        title="Email Updates"
      />

      <SummaryUpdateSectionForm
        mutate={mutate}
        summaryEmailFrequency={summaryEmailFrequency}
      />
    </FormSection>
  );
}

function SummaryUpdateSectionForm({
  summaryEmailFrequency,
  mutate,
}: {
  summaryEmailFrequency: Frequency;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SaveEmailUpdateSettingsBody>({
    resolver: zodResolver(saveEmailUpdateSettingsBody),
    defaultValues: {
      summaryEmailFrequency:
        summaryEmailFrequency === "WEEKLY" ? "WEEKLY" : "NEVER",
    },
  });

  const onSubmit: SubmitHandler<SaveEmailUpdateSettingsBody> = useCallback(
    async (data) => {
      const res = await updateEmailSettingsAction(emailAccountId, data);

      if (res?.serverError) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({ description: "Settings updated!" });
      }

      mutate();
    },
    [emailAccountId, mutate]
  );

  const options: { label: string; value: Frequency }[] = useMemo(
    () => [
      {
        label: "Never",
        value: Frequency.NEVER,
      },
      {
        label: "Weekly",
        value: Frequency.WEEKLY,
      },
    ],
    []
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {/* <Select
        label="Stats Update Email"
        options={options}
        {...register("statsEmailFrequency")}
        error={errors.statsEmailFrequency}
      /> */}
      <Select
        label="Summary Email"
        options={options}
        {...register("summaryEmailFrequency")}
        error={errors.summaryEmailFrequency}
      />

      <Button loading={isSubmitting} type="submit">
        Save
      </Button>
    </form>
  );
}
