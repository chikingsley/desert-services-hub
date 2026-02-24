"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createOrganizationAction } from "@/utils/actions/organization";
import {
  type CreateOrganizationBody,
  createOrganizationBody,
} from "@/utils/actions/organization.validation";
import { slugify } from "@/utils/string";

export default function CreateOrganizationPage() {
  const router = useRouter();
  const { isLoading, mutate, error } = useUser();
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields },
    watch,
    setValue,
  } = useForm<CreateOrganizationBody>({
    resolver: zodResolver(createOrganizationBody),
  });

  const nameValue = watch("name");
  const userModifiedSlug = dirtyFields.slug;

  useEffect(() => {
    if (nameValue && !userModifiedSlug) {
      const generatedSlug = slugify(nameValue);
      setValue("slug", generatedSlug);
    }
  }, [nameValue, userModifiedSlug, setValue]);

  const onSubmit: SubmitHandler<CreateOrganizationBody> = useCallback(
    async (data) => {
      const result = await createOrganizationAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error creating organization",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Organization created successfully!" });
        mutate();
        router.push(`/organization/${result?.data?.id}`);
      }
    },
    [mutate, router, emailAccountId]
  );

  return (
    <PageWrapper className="mx-auto max-w-2xl">
      <PageHeader title="Create Organization" />
      <LoadingContent error={error} loading={isLoading}>
        <form
          className="mt-4 max-w-sm space-y-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <Input
            error={errors.name}
            label="Organization Name"
            name="name"
            placeholder="Apple Inc."
            registerProps={register("name")}
            type="text"
          />

          <Input
            error={errors.slug}
            label="URL Slug"
            name="slug"
            placeholder="apple-inc"
            registerProps={register("slug")}
            type="text"
          />

          <Button loading={isSubmitting} type="submit">
            Create Organization
          </Button>
        </form>
      </LoadingContent>
    </PageWrapper>
  );
}
