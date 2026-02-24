"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { CopyInput } from "@/components/CopyInput";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { SectionDescription } from "@/components/Typography";
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
  createApiKeyAction,
  deactivateApiKeyAction,
} from "@/utils/actions/api-key";
import {
  type CreateApiKeyBody,
  createApiKeyBody,
} from "@/utils/actions/api-key.validation";
import { getActionErrorMessage } from "@/utils/error";

export function ApiKeysCreateButtonModal({ mutate }: { mutate: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Create key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new secret key</DialogTitle>
          <DialogDescription>
            This will create a new secret key for your account. You will need to
            use this secret key to authenticate your requests to the API.
          </DialogDescription>
        </DialogHeader>

        <ApiKeysForm mutate={mutate} />
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysForm({ mutate }: { mutate: () => void }) {
  const [secretKey, setSecretKey] = useState("");

  const { execute, isExecuting } = useAction(createApiKeyAction, {
    onSuccess: (result) => {
      if (!result?.data?.secretKey) {
        toastError({ description: "Failed to create API key" });
        return;
      }

      setSecretKey(result.data.secretKey);
      toastSuccess({ description: "API key created!" });
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Failed to create API key",
        }),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateApiKeyBody>({
    resolver: zodResolver(createApiKeyBody),
    defaultValues: {},
  });

  return secretKey ? (
    <div className="space-y-2">
      <SectionDescription>
        This will only be shown once. Please copy it. Your secret key is:
      </SectionDescription>
      <CopyInput value={secretKey} />
    </div>
  ) : (
    <form className="space-y-4" onSubmit={handleSubmit(execute)}>
      <Input
        error={errors.name}
        label="Name (optional)"
        name="name"
        placeholder="My secret key"
        registerProps={register("name")}
        type="text"
      />

      <Button loading={isExecuting} type="submit">
        Create
      </Button>
    </form>
  );
}

export function ApiKeysDeactivateButton({
  id,
  mutate,
}: {
  id: string;
  mutate: () => void;
}) {
  const { execute, isExecuting } = useAction(deactivateApiKeyAction, {
    onSuccess: () => {
      toastSuccess({ description: "API key deactivated!" });
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Failed to deactivate API key",
        }),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  return (
    <Button
      loading={isExecuting}
      onClick={() => execute({ id })}
      size="sm"
      variant="outline"
    >
      Revoke
    </Button>
  );
}
