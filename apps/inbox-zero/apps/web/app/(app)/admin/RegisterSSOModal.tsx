"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import TextareaAutosize from "react-textarea-autosize";
import { ErrorMessage, Input, Label } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDialogState } from "@/hooks/useDialogState";
import { registerSSOProviderAction } from "@/utils/actions/sso";
import {
  type SsoRegistrationBody,
  ssoRegistrationBody,
} from "@/utils/actions/sso.validation";

export function RegisterSSOModal() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SsoRegistrationBody>({
    resolver: zodResolver(ssoRegistrationBody),
  });

  const { isOpen, onToggle, onClose } = useDialogState();

  const { executeAsync: executeRegisterSSO, isExecuting } = useAction(
    registerSSOProviderAction
  );

  const onSubmit: SubmitHandler<SsoRegistrationBody> = useCallback(
    async (data) => {
      const result = await executeRegisterSSO(data);

      if (result?.serverError) {
        toastError({
          title: "Error registering SSO",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: "SSO registration initiated successfully!",
        });
        reset();
        onClose();
      }
    },
    [executeRegisterSSO, reset, onClose]
  );

  return (
    <Dialog onOpenChange={onToggle} open={isOpen}>
      <DialogTrigger asChild>
        <Button>Register SSO Provider</Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enterprise SSO Registration (SAML)</DialogTitle>
          <DialogDescription>
            Configure Single Sign-On (SAML) for your organization. This will
            enable your team to sign in using your SAML identity provider.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 gap-4">
            <Input
              error={errors.organizationName}
              label="Organization Name"
              name="organizationName"
              placeholder="e.g., Your Company"
              registerProps={register("organizationName")}
              type="text"
            />

            <Input
              error={errors.providerId}
              label="Provider ID"
              name="providerId"
              placeholder="e.g., your-company-saml"
              registerProps={register("providerId")}
              type="text"
            />

            <Input
              error={errors.domain}
              label="Domain"
              name="domain"
              placeholder="e.g., your-company.com"
              registerProps={register("domain")}
              type="text"
            />

            <div className="space-y-2">
              <Label label="IDP Metadata (XML)" name="idpMetadata" />
              <TextareaAutosize
                className="block w-full flex-1 whitespace-pre-wrap rounded-md border border-border bg-background shadow-sm focus:border-black focus:ring-black sm:text-sm"
                id="idpMetadata"
                minRows={3}
                rows={3}
                {...register("idpMetadata")}
                placeholder="Paste your SAML IDP metadata XML from your identity provider here."
              />
              {errors.idpMetadata && (
                <ErrorMessage message={errors.idpMetadata.message ?? ""} />
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button loading={isExecuting} type="submit">
              Register SSO
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
