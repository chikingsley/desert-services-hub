"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BarChartIcon } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import type { OpenAiModelsResponse } from "@/app/api/ai/models/route";
import { AlertBasic, AlertError } from "@/components/Alert";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { Select } from "@/components/Select";
import { SettingsSection } from "@/components/SettingsSection";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateAiSettingsAction } from "@/utils/actions/settings";
import {
  type SaveAiSettingsBody,
  saveAiSettingsBody,
} from "@/utils/actions/settings.validation";
import {
  DEFAULT_PROVIDER,
  Provider,
  providerOptions,
} from "@/utils/llms/config";
import { prefixPath } from "@/utils/path";

export function ModelSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useUser();

  const { data: dataModels, isLoading: isLoadingModels } =
    useSWR<OpenAiModelsResponse>(
      data?.aiApiKey && data.aiProvider === Provider.OPEN_AI
        ? "/api/ai/models"
        : null
    );

  return (
    <SettingsSection>
      <LoadingContent error={error} loading={isLoading || isLoadingModels}>
        {data && (
          <ModelSectionForm
            aiApiKey={data.aiApiKey}
            aiModel={data.aiModel}
            aiProvider={data.aiProvider}
            emailAccountId={emailAccountId}
            models={dataModels}
            refetchUser={mutate}
          />
        )}
      </LoadingContent>
    </SettingsSection>
  );
}

function ModelSectionForm(props: {
  aiProvider: SaveAiSettingsBody["aiProvider"] | null;
  aiModel: SaveAiSettingsBody["aiModel"] | null;
  aiApiKey: SaveAiSettingsBody["aiApiKey"] | null;
  models?: OpenAiModelsResponse;
  refetchUser: () => void;
  emailAccountId: string;
}) {
  const { refetchUser, emailAccountId } = props;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SaveAiSettingsBody>({
    resolver: zodResolver(saveAiSettingsBody),
    defaultValues: {
      aiProvider: props.aiProvider ?? DEFAULT_PROVIDER,
      aiModel: props.aiModel ?? "",
      aiApiKey: props.aiApiKey ?? undefined,
    },
  });

  const aiProvider = watch("aiProvider");

  const onSubmit: SubmitHandler<SaveAiSettingsBody> = useCallback(
    async (data) => {
      const res = await updateAiSettingsAction(data);

      if (res?.serverError) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({
          description:
            "Settings updated! Please check it works on the Assistant page.",
        });
      }

      refetchUser();
    },
    [refetchUser]
  );

  const globalError = (errors as Record<string, { message?: string }>)[""];

  const modelSelectOptions =
    aiProvider === Provider.OPEN_AI && watch("aiApiKey")
      ? props.models?.map((model) => ({
          label: model.id,
          value: model.id,
        })) || []
      : [];

  return (
    <form className="max-w-sm space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Select
        label="Provider"
        options={providerOptions}
        {...register("aiProvider")}
        error={errors.aiProvider}
      />

      {watch("aiProvider") !== DEFAULT_PROVIDER && (
        <>
          {modelSelectOptions.length ? (
            <Select
              label="Model"
              options={modelSelectOptions}
              {...register("aiModel")}
              error={errors.aiModel}
            />
          ) : (
            <Input
              error={errors.aiModel}
              label="Model"
              name="aiModel"
              registerProps={register("aiModel")}
              type="text"
            />
          )}

          <Input
            error={errors.aiApiKey}
            label="API Key"
            name="aiApiKey"
            registerProps={register("aiApiKey")}
            type="password"
          />
        </>
      )}

      {globalError?.message && (
        <AlertError description={globalError.message} title="Error saving" />
      )}

      {watch("aiProvider") === Provider.OPEN_AI &&
        watch("aiApiKey") &&
        modelSelectOptions.length === 0 &&
        (props.aiApiKey ? (
          <AlertError
            description="We couldn't validate your API key. Please try again."
            title="Invalid API Key"
          />
        ) : (
          <AlertBasic
            description="Click Save to view available models for your API key."
            title="API Key"
          />
        ))}

      <div className="flex items-center gap-2">
        <Button loading={isSubmitting} size="sm" type="submit">
          Save
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={prefixPath(emailAccountId, "/usage")}>
            <BarChartIcon className="mr-2 size-4" />
            View usage
          </Link>
        </Button>
      </div>
    </form>
  );
}
