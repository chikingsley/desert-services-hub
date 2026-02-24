"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckCircleIcon, TrashIcon, XIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";
import { z } from "zod";
import type { ContactsResponse } from "@/app/api/google/contacts/route";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { Input, Label } from "@/components/Input";
import { ButtonLoader } from "@/components/Loading";
import { toastError, toastSuccess } from "@/components/Toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandShortcut } from "@/components/ui/command";
import { env } from "@/env";
import { useModifierKey } from "@/hooks/useModifierKey";
import { useAccount } from "@/providers/EmailAccountProvider";
import { sendEmailAction } from "@/utils/actions/mail";
import { extractNameFromEmail } from "@/utils/email";
import type { SendEmailBody } from "@/utils/gmail/mail";

export type ReplyingToEmail = {
  threadId?: string;
  headerMessageId?: string;
  messageId?: string;
  references?: string;
  subject: string;
  to: string;
  cc?: string;
  bcc?: string;
  draftHtml?: string | undefined; // The part being written/edited
  quotedContentHtml?: string | undefined; // The part being quoted/replied to
  date?: string; // The date of the original email
};

export const ComposeEmailForm = ({
  replyingToEmail,
  refetch,
  onSuccess,
  onDiscard,
}: {
  replyingToEmail?: ReplyingToEmail;
  refetch?: () => void;
  onSuccess?: (messageId: string, threadId: string) => void;
  onDiscard?: () => void;
}) => {
  const { emailAccountId } = useAccount();
  const [showFullContent, setShowFullContent] = useState(false);
  const { symbol } = useModifierKey();
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<SendEmailBody>({
    defaultValues: {
      replyToEmail: getReplyToEmailPayload(replyingToEmail),
      subject: replyingToEmail?.subject,
      to: replyingToEmail?.to,
      cc: replyingToEmail?.cc,
      messageHtml: replyingToEmail?.draftHtml,
    },
  });

  const onSubmit: SubmitHandler<SendEmailBody> = useCallback(
    async (data) => {
      const enrichedData = {
        ...data,
        replyToEmail: getReplyToEmailPayload(data.replyToEmail),
        messageHtml: showFullContent
          ? data.messageHtml || ""
          : `${data.messageHtml || ""}<br>${replyingToEmail?.quotedContentHtml || ""}`,
      };

      try {
        const res = await sendEmailAction(emailAccountId, enrichedData);
        if (res?.serverError) {
          toastError({
            description: "There was an error sending the email :(",
          });
        } else if (res?.data) {
          toastSuccess({ description: "Email sent!" });
          onSuccess?.(res.data.messageId ?? "", res.data.threadId ?? "");
        }
      } catch (error) {
        console.error(error);
        toastError({ description: "There was an error sending the email :(" });
      }

      refetch?.();
    },
    [refetch, onSuccess, showFullContent, replyingToEmail, emailAccountId]
  );

  useHotkeys(
    "mod+enter",
    (e) => {
      e.preventDefault();
      if (!isSubmitting) {
        formRef.current?.requestSubmit();
      }
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
    }
  );

  const [searchQuery, setSearchQuery] = useState("");
  const { data } = useSWR<ContactsResponse, { error: string }>(
    env.NEXT_PUBLIC_CONTACTS_ENABLED
      ? `/api/google/contacts?query=${searchQuery}`
      : null,
    {
      keepPreviousData: true,
    }
  );

  // TODO not in love with how this was implemented
  const selectedEmailAddressses = watch("to", "").split(",").filter(Boolean);

  const onRemoveSelectedEmail = (emailAddress: string) => {
    const filteredEmailAddresses = selectedEmailAddressses.filter(
      (email) => email !== emailAddress
    );
    setValue("to", filteredEmailAddresses.join(","));
  };

  const handleComboboxOnChange = (values: string[]) => {
    // this assumes last value given by combobox is user typed value
    const lastValue = values[values.length - 1];

    const { success } = z.string().email().safeParse(lastValue);
    if (success) {
      setValue("to", values.join(","));
      setSearchQuery("");
    }
  };

  const [editReply, setEditReply] = useState(false);

  const handleEditorChange = useCallback(
    (html: string) => {
      setValue("messageHtml", html);
    },
    [setValue]
  );

  const editorRef = useRef<TiptapHandle>(null);

  const showExpandedContent = useCallback(() => {
    if (!showFullContent) {
      try {
        editorRef.current?.appendContent(
          replyingToEmail?.quotedContentHtml ?? ""
        );
      } catch (error) {
        console.error("Failed to append content:", error);
        toastError({ description: "Failed to show full content" });
        return; // Don't set showFullContent to true if append failed
      }
    }
    setShowFullContent(true);
  }, [showFullContent, replyingToEmail?.quotedContentHtml]);

  return (
    <form className="space-y-2" onSubmit={handleSubmit(onSubmit)} ref={formRef}>
      {replyingToEmail?.to && !editReply ? (
        <button
          className="flex gap-1 text-left"
          onClick={() => setEditReply(true)}
          type="button"
        >
          <span className="text-green-500">Draft</span>{" "}
          <span className="max-w-md break-words text-foreground">
            to {extractNameFromEmail(replyingToEmail.to)}
          </span>
        </button>
      ) : (
        <>
          {env.NEXT_PUBLIC_CONTACTS_ENABLED ? (
            <div className="flex space-x-2">
              <div className="mt-2">
                <Label label="To" name="to" />
              </div>
              <Combobox
                multiple
                onChange={handleComboboxOnChange}
                value={selectedEmailAddressses}
              >
                <div className="flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground">
                  {selectedEmailAddressses.map((emailAddress) => (
                    <Badge
                      className="cursor-pointer rounded-md"
                      key={emailAddress}
                      onClick={() => {
                        onRemoveSelectedEmail(emailAddress);
                        setSearchQuery(emailAddress);
                      }}
                      variant="secondary"
                    >
                      {extractNameFromEmail(emailAddress)}

                      <button
                        onClick={() => onRemoveSelectedEmail(emailAddress)}
                        type="button"
                      >
                        <XIcon className="ml-1.5 size-3" />
                      </button>
                    </Badge>
                  ))}

                  <div className="relative flex-1">
                    <ComboboxInput
                      className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyUp={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setValue(
                            "to",
                            [...selectedEmailAddressses, searchQuery].join(",")
                          );
                          setSearchQuery("");
                        }
                      }}
                      value={searchQuery}
                    />

                    {!!data?.result?.length && (
                      <ComboboxOptions
                        className={
                          "absolute z-10 mt-1 max-h-60 overflow-auto rounded-md bg-popover py-1 text-base shadow-lg ring-1 ring-border focus:outline-none sm:text-sm"
                        }
                      >
                        <ComboboxOption
                          className="h-0 w-0 overflow-hidden"
                          value={searchQuery}
                        />
                        {data?.result.map((contact) => {
                          const person = {
                            emailAddress:
                              contact.person?.emailAddresses?.[0].value,
                            name: contact.person?.names?.[0].displayName,
                            profilePictureUrl: contact.person?.photos?.[0].url,
                          };

                          return (
                            <ComboboxOption
                              className={({ focus }) =>
                                `cursor-default select-none px-4 py-1 text-foreground ${
                                  focus && "bg-accent"
                                }`
                              }
                              key={person.emailAddress}
                              value={person.emailAddress}
                            >
                              {({ selected }) => (
                                <div className="my-2 flex items-center">
                                  {selected ? (
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full">
                                      <CheckCircleIcon className="h-6 w-6" />
                                    </div>
                                  ) : (
                                    <Avatar>
                                      <AvatarImage
                                        alt={
                                          person.emailAddress ||
                                          "Profile picture"
                                        }
                                        src={person.profilePictureUrl!}
                                      />
                                      <AvatarFallback>
                                        {person.emailAddress?.[0] || "A"}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                  <div className="ml-4 flex flex-col justify-center">
                                    <div className="text-foreground">
                                      {person.name}
                                    </div>
                                    <div className="font-semibold text-muted-foreground text-sm">
                                      {person.emailAddress}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </ComboboxOption>
                          );
                        })}
                      </ComboboxOptions>
                    )}
                  </div>
                </div>
              </Combobox>
            </div>
          ) : (
            <Input
              error={errors.to}
              label="To"
              name="to"
              registerProps={register("to", { required: true })}
              type="text"
            />
          )}

          <Input
            className="border border-input bg-background focus:border-slate-200 focus:ring-0 focus:ring-slate-200"
            error={errors.subject}
            name="subject"
            placeholder="Subject"
            registerProps={register("subject", { required: true })}
            type="text"
          />
        </>
      )}

      <Tiptap
        className="min-h-[200px]"
        initialContent={replyingToEmail?.draftHtml}
        onChange={handleEditorChange}
        onMoreClick={
          !replyingToEmail?.quotedContentHtml || showFullContent
            ? undefined
            : showExpandedContent
        }
        ref={editorRef}
      />

      <div className="flex items-center justify-between">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting && <ButtonLoader />}
          Send
          <CommandShortcut className="ml-2">{symbol}+Enter</CommandShortcut>
        </Button>

        {onDiscard && (
          <Button
            disabled={isSubmitting}
            onClick={onDiscard}
            size="icon"
            type="button"
            variant="secondary"
          >
            <TrashIcon className="h-4 w-4" />
            <span className="sr-only">Discard</span>
          </Button>
        )}
      </div>
    </form>
  );
};

function getReplyToEmailPayload(
  replyingToEmail:
    | Pick<
        ReplyingToEmail,
        "threadId" | "headerMessageId" | "references" | "messageId"
      >
    | undefined
): SendEmailBody["replyToEmail"] | undefined {
  const threadId = replyingToEmail?.threadId?.trim();
  const headerMessageId = replyingToEmail?.headerMessageId?.trim();

  if (!(threadId && headerMessageId)) {
    return undefined;
  }

  return {
    threadId,
    headerMessageId,
    ...(replyingToEmail?.references
      ? { references: replyingToEmail.references }
      : {}),
    ...(replyingToEmail?.messageId
      ? { messageId: replyingToEmail.messageId }
      : {}),
  };
}
