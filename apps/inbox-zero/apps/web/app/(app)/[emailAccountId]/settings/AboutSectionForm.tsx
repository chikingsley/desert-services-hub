"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { saveAboutAction } from "@/utils/actions/user";
import {
  type SaveAboutBody,
  saveAboutBody,
} from "@/utils/actions/user.validation";
import { getActionErrorMessage } from "@/utils/error";

export function AboutSection({ onSuccess }: { onSuccess: () => void }) {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  return (
    <LoadingContent
      error={error}
      loading={isLoading}
      loadingComponent={<Skeleton className="h-32 w-full" />}
    >
      <AboutSectionForm
        about={data?.about ?? null}
        mutate={mutate}
        onSuccess={onSuccess}
      />
    </LoadingContent>
  );
}

const AboutSectionForm = ({
  about,
  mutate,
  onSuccess,
}: {
  about: string | null;
  mutate: () => void;
  onSuccess: () => void;
}) => {
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm<SaveAboutBody>({
    defaultValues: { about: about ?? "" },
    resolver: zodResolver(saveAboutBody),
  });

  const { emailAccountId } = useAccount();

  const { execute, isExecuting } = useAction(
    saveAboutAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Your profile has been updated!" });
        onSuccess();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
      onSettled: () => {
        mutate();
      },
    }
  );

  return (
    <form onSubmit={handleSubmit(execute)}>
      <Input
        autosizeTextarea
        error={errors.about}
        label=""
        name="about"
        placeholder={`My name is Alex Smith. I'm the founder of Acme.

- If I'm CC'd, it's not To Reply
- Emails from jane@accounting.com aren't Notifications`}
        registerProps={register("about")}
        rows={4}
        type="text"
      />
      <Button className="mt-8" loading={isExecuting} type="submit">
        Save
      </Button>
    </form>
  );
};
