"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/Button";
import { ClientOnly } from "@/components/ClientOnly";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchSignaturesFromProviderAction } from "@/utils/actions/email-account";
import { saveSignatureAction } from "@/utils/actions/user";
import type { SaveSignatureBody } from "@/utils/actions/user.validation";
import { saveSignatureBody } from "@/utils/actions/user.validation";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getActionErrorMessage } from "@/utils/error";

export const SignatureSectionForm = ({
  signature,
}: {
  signature: string | null;
}) => {
  const defaultSignature = signature ?? "";

  const { handleSubmit, setValue } = useForm<SaveSignatureBody>({
    defaultValues: { signature: defaultSignature },
    resolver: zodResolver(saveSignatureBody),
  });

  const editorRef = useRef<TiptapHandle>(null);

  const { emailAccountId, provider } = useAccount();
  const isGmail = isGoogleProvider(provider);

  const { execute, isExecuting } = useAction(
    saveSignatureAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Signature saved" });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    }
  );
  const { executeAsync: executeFetchSignatures } = useAction(
    fetchSignaturesFromProviderAction.bind(null, emailAccountId)
  );

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("signature", html);
    },
    [setValue]
  );

  return (
    <form onSubmit={handleSubmit(execute)}>
      <FormSection>
        <FormSectionLeft
          description="Appended at the end of all outgoing messages."
          title="Signature"
        />
        <div className="md:col-span-2">
          <FormSectionRight>
            <div className="sm:col-span-full">
              <ClientOnly>
                <Tiptap
                  className="min-h-[100px]"
                  initialContent={defaultSignature}
                  onChange={handleEditorChange}
                  ref={editorRef}
                />
              </ClientOnly>
            </div>
          </FormSectionRight>
          <SubmitButtonWrapper>
            <div className="flex gap-2">
              <Button loading={isExecuting} size="lg" type="submit">
                Save
              </Button>
              <Button
                color="white"
                onClick={async () => {
                  const result = await executeFetchSignatures();

                  if (result?.serverError) {
                    toastError({
                      title: `Error loading signature from ${isGmail ? "Gmail" : "Outlook"}`,
                      description: result.serverError,
                    });
                    return;
                  }

                  const signatures = result?.data?.signatures || [];
                  const defaultSig =
                    signatures.find((sig) => sig.isDefault) || signatures[0];

                  if (defaultSig?.signature) {
                    editorRef.current?.appendContent(defaultSig.signature);
                    toastSuccess({
                      title: "Signature loaded",
                      description: isGmail
                        ? "Loaded from Gmail"
                        : "Extracted from recent sent emails",
                    });
                  } else {
                    toastInfo({
                      title: "No signature found",
                      description: isGmail
                        ? "No signature found in your Gmail account"
                        : "No signature found in recent sent emails",
                    });
                  }
                }}
                size="lg"
                type="button"
              >
                Load from {isGmail ? "Gmail" : "Outlook"}
              </Button>
            </div>
          </SubmitButtonWrapper>
        </div>
      </FormSection>
    </form>
  );
};
