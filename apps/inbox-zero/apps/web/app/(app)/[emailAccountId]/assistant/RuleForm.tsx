"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BotIcon,
  MailIcon,
  PencilIcon,
  SettingsIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import { ActionSteps } from "@/app/(app)/[emailAccountId]/assistant/ActionSteps";
import { ConditionSteps } from "@/app/(app)/[emailAccountId]/assistant/ConditionSteps";
import { LearnedPatternsDialog } from "@/app/(app)/[emailAccountId]/assistant/group/LearnedPatterns";
import { RuleSectionCard } from "@/app/(app)/[emailAccountId]/assistant/RuleSectionCard";
import { AlertError } from "@/components/Alert";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { env } from "@/env";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { useFolders } from "@/hooks/useFolders";
import { useLabels } from "@/hooks/useLabels";
import { useRule } from "@/hooks/useRule";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionIcon } from "@/utils/action-display";
import {
  createRuleAction,
  deleteRuleAction,
  updateRuleAction,
} from "@/utils/actions/rule";
import {
  type CreateRuleBody,
  createRuleBody,
} from "@/utils/actions/rule.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { prefixPath } from "@/utils/path";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import { getEmailTerminology } from "@/utils/terminology";

export function Rule({
  ruleId,
  alwaysEditMode = false,
}: {
  ruleId: string;
  alwaysEditMode?: boolean;
}) {
  const { data, isLoading, error, mutate } = useRule(ruleId);

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data && (
        <RuleForm
          alwaysEditMode={alwaysEditMode}
          mutate={mutate}
          rule={data.rule}
        />
      )}
    </LoadingContent>
  );
}

export function RuleForm({
  rule,
  alwaysEditMode = false,
  onSuccess,
  isDialog = false,
  mutate,
  onCancel,
}: {
  rule: CreateRuleBody & { id?: string };
  alwaysEditMode?: boolean;
  onSuccess?: () => void;
  isDialog?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: lazy
  mutate?: (data?: any, options?: any) => void;
  onCancel?: () => void;
}) {
  const { emailAccountId, provider } = useAccount();

  const form = useForm<CreateRuleBody>({
    resolver: zodResolver(createRuleBody),
    defaultValues: rule
      ? {
          ...rule,
          digest: rule.actions.some(
            (action) => action.type === ActionType.DIGEST
          ),
          actions: [
            ...rule.actions
              .filter((action) => action.type !== ActionType.DIGEST)
              .map((action) => ({
                ...action,
                delayInMinutes: action.delayInMinutes,
                content: {
                  ...action.content,
                  setManually: !!action.content?.value,
                },
                folderName: action.folderName,
                folderId: action.folderId,
              })),
          ],
        }
      : undefined,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState,
    trigger,
  } = form;

  const { errors, isSubmitting, isSubmitted } = formState;

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
  } = useFieldArray({
    control,
    name: "conditions",
  });
  const {
    fields: actionFields,
    append,
    remove,
  } = useFieldArray({ control, name: "actions" });

  const { userLabels, isLoading, mutate: mutateLabels } = useLabels();
  const { folders, isLoading: foldersLoading } = useFolders(provider);
  const router = useRouter();

  const posthog = usePostHog();

  const onSubmit: SubmitHandler<CreateRuleBody> = useCallback(
    async (data) => {
      // set content to empty string if it's not set manually
      for (const action of data.actions) {
        if (
          action.type === ActionType.DRAFT_EMAIL &&
          !action.content?.setManually
        ) {
          action.content = { value: "", ai: false };
        }
      }

      // Add DIGEST action if digest is enabled
      const actionsToSubmit = [...data.actions];
      if (data.digest) {
        actionsToSubmit.push({ type: ActionType.DIGEST });
      }

      if (data.id) {
        if (mutate) {
          // mutate delayInMinutes optimistically to keep the UI consistent
          // in case the modal is reopened immediately after saving
          const optimisticData = {
            rule: {
              ...rule,
              actions: rule.actions.map((action, index) => ({
                ...action,
                delayInMinutes: data.actions[index]?.delayInMinutes,
              })),
            },
          };
          mutate(optimisticData, false);
        }

        const res = await updateRuleAction(emailAccountId, {
          ...data,
          actions: actionsToSubmit,
          id: data.id,
        });

        if (res?.serverError) {
          console.error(res);
          toastError({ description: res.serverError });
          if (mutate) {
            mutate();
          }
        } else if (res?.data?.rule) {
          toastSuccess({ description: "Saved!" });
          // Revalidate to get the real data from server
          if (mutate) {
            mutate();
          }
          posthog.capture("User updated AI rule", {
            conditions: data.conditions.map((condition) => condition.type),
            actions: actionsToSubmit.map((action) => action.type),
            runOnThreads: data.runOnThreads,
            digest: data.digest,
          });
          if (isDialog && onSuccess) {
            onSuccess();
          } else {
            router.push(prefixPath(emailAccountId, "/automation?tab=rules"));
          }
        } else {
          toastError({
            description: "There was an error updating the rule.",
          });
          if (mutate) {
            mutate();
          }
        }
      } else {
        const res = await createRuleAction(emailAccountId, {
          ...data,
          actions: actionsToSubmit,
        });

        if (res?.serverError) {
          console.error(res);
          toastError({ description: res.serverError });
        } else if (res?.data?.rule) {
          toastSuccess({ description: "Created!" });
          posthog.capture("User created AI rule", {
            conditions: data.conditions.map((condition) => condition.type),
            actions: actionsToSubmit.map((action) => action.type),
            runOnThreads: data.runOnThreads,
            digest: data.digest,
          });
          if (isDialog && onSuccess) {
            onSuccess();
          } else {
            router.replace(
              prefixPath(emailAccountId, `/assistant/rule/${res.data.rule.id}`)
            );
            router.push(prefixPath(emailAccountId, "/automation?tab=rules"));
          }
        } else {
          toastError({
            description: "There was an error creating the rule.",
          });
        }
      }
    },
    [router, posthog, emailAccountId, isDialog, onSuccess, mutate, rule]
  );

  const conditions = watch("conditions");

  // biome-ignore lint/correctness/useExhaustiveDependencies: needed
  useEffect(() => {
    trigger("conditions");
  }, [conditions]);

  const actionErrors = useMemo(() => {
    const actionErrors: string[] = [];
    watch("actions")?.forEach((_, index) => {
      const actionError =
        formState.errors?.actions?.[index]?.url?.root?.message ||
        formState.errors?.actions?.[index]?.labelId?.root?.message ||
        formState.errors?.actions?.[index]?.to?.root?.message;
      if (actionError) {
        actionErrors.push(actionError);
      }
    });
    return actionErrors;
  }, [formState, watch]);

  const conditionalOperator = watch("conditionalOperator");
  const terminology = getEmailTerminology(provider);

  const formErrors = useMemo(() => {
    return Object.values(formState.errors)
      .filter((error): error is { message: string } => Boolean(error.message))
      .map((error) => error.message);
  }, [formState]);

  const typeOptions = useMemo(() => {
    const options: {
      label: string;
      value: ActionType;
      icon: React.ElementType;
    }[] = [
      {
        label: terminology.label.action,
        value: ActionType.LABEL,
        icon: getActionIcon(ActionType.LABEL),
      },
      ...(isMicrosoftProvider(provider)
        ? [
            {
              label: "Move to folder",
              value: ActionType.MOVE_FOLDER,
              icon: getActionIcon(ActionType.MOVE_FOLDER),
            },
          ]
        : []),
      {
        label: "Draft reply",
        value: ActionType.DRAFT_EMAIL,
        icon: getActionIcon(ActionType.DRAFT_EMAIL),
      },
      {
        label: "Archive",
        value: ActionType.ARCHIVE,
        icon: getActionIcon(ActionType.ARCHIVE),
      },
      {
        label: "Mark read",
        value: ActionType.MARK_READ,
        icon: getActionIcon(ActionType.MARK_READ),
      },
      ...(env.NEXT_PUBLIC_EMAIL_SEND_ENABLED
        ? [
            {
              label: "Reply",
              value: ActionType.REPLY,
              icon: getActionIcon(ActionType.REPLY),
            },
            {
              label: "Send email",
              value: ActionType.SEND_EMAIL,
              icon: getActionIcon(ActionType.SEND_EMAIL),
            },
            {
              label: "Forward",
              value: ActionType.FORWARD,
              icon: getActionIcon(ActionType.FORWARD),
            },
          ]
        : []),
      {
        label: "Mark spam",
        value: ActionType.MARK_SPAM,
        icon: getActionIcon(ActionType.MARK_SPAM),
      },
      {
        label: "Call webhook",
        value: ActionType.CALL_WEBHOOK,
        icon: getActionIcon(ActionType.CALL_WEBHOOK),
      },
      // NOTIFY_SENDER is only available for cold email rules
      ...(rule.systemType === SystemType.COLD_EMAIL &&
      env.NEXT_PUBLIC_IS_RESEND_CONFIGURED
        ? [
            {
              label: "Notify sender",
              value: ActionType.NOTIFY_SENDER,
              icon: getActionIcon(ActionType.NOTIFY_SENDER),
            },
          ]
        : []),
    ];

    return options;
  }, [provider, terminology.label.action, rule.systemType]);

  const [isNameEditMode, setIsNameEditMode] = useState(alwaysEditMode);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleNameEditMode = useCallback(() => {
    if (!alwaysEditMode) {
      setIsNameEditMode((prev: boolean) => !prev);
    }
  }, [alwaysEditMode]);

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        {isSubmitted && formErrors.length > 0 && (
          <div className="mt-4">
            <AlertError
              description={
                <ul className="list-disc">
                  {formErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              }
              title="Error"
            />
          </div>
        )}

        <div>
          {isNameEditMode ? (
            <Input
              error={errors.name}
              label="Rule name"
              name="name"
              placeholder="e.g. Label receipts"
              registerProps={register("name")}
              type="text"
            />
          ) : (
            <TypographyH3
              className="group flex cursor-pointer items-center"
              onClick={toggleNameEditMode}
            >
              {watch("name")}
              <PencilIcon className="ml-2 size-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </TypographyH3>
          )}
        </div>

        <RuleSectionCard
          color="blue"
          errors={
            errors.conditions?.root?.message ? (
              <AlertError
                description={errors.conditions.root.message}
                title="Error"
              />
            ) : undefined
          }
          icon={MailIcon}
          title="When you get an email"
        >
          <ConditionSteps
            appendCondition={appendCondition}
            conditionalOperator={conditionalOperator}
            conditionFields={conditionFields}
            conditions={conditions}
            control={control}
            errors={errors}
            register={register}
            removeCondition={removeCondition}
            ruleSystemType={rule.systemType}
            setValue={setValue}
            watch={watch}
          />
        </RuleSectionCard>

        <RuleSectionCard
          color="green"
          errors={
            actionErrors.length > 0 ? (
              <AlertError
                description={
                  <ul className="list-inside list-disc">
                    {actionErrors.map((error, index) => (
                      <li key={`action-${index}`}>{error}</li>
                    ))}
                  </ul>
                }
                title="Error"
              />
            ) : undefined
          }
          icon={BotIcon}
          title="Then:"
        >
          <ActionSteps
            actionFields={actionFields}
            append={append}
            control={control}
            emailAccountId={emailAccountId}
            errors={errors}
            folders={folders}
            foldersLoading={foldersLoading}
            isLoading={isLoading}
            mutate={mutateLabels}
            register={register}
            remove={remove}
            setValue={setValue}
            typeOptions={typeOptions}
            userLabels={userLabels}
            watch={watch}
          />
        </RuleSectionCard>

        <div className="flex items-center justify-between">
          <Dialog>
            <DialogTrigger asChild>
              <Button Icon={SettingsIcon} size="sm" variant="outline">
                Advanced Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Advanced Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Toggle
                    disabled={!allowMultipleConditions(rule.systemType)}
                    enabled={watch("runOnThreads") ?? false}
                    labelRight="Apply to threads"
                    name="runOnThreads"
                    onChange={(enabled) => {
                      setValue("runOnThreads", enabled);
                    }}
                  />

                  <ThreadsExplanation size="md" />
                </div>

                {env.NEXT_PUBLIC_DIGEST_ENABLED && (
                  <div className="flex items-center space-x-2">
                    <Toggle
                      enabled={watch("digest") ?? false}
                      labelRight="Include in daily digest"
                      name="digest"
                      onChange={(enabled) => {
                        setValue("digest", enabled);
                      }}
                    />

                    <TooltipExplanation
                      side="right"
                      size="md"
                      text="When enabled you will receive a summary of the emails that match this rule in your digest email."
                    />
                  </div>
                )}

                {!!rule.id && (
                  <div className="flex">
                    <LearnedPatternsDialog
                      disabled={isConversationStatusType(rule.systemType)}
                      groupId={rule.groupId || null}
                      ruleId={rule.id}
                    />
                  </div>
                )}

                {rule.id && (
                  <Button
                    disabled={isSubmitting}
                    Icon={TrashIcon}
                    loading={isDeleting}
                    onClick={async () => {
                      const yes = confirm(
                        "Are you sure you want to delete this rule?"
                      );
                      if (yes) {
                        try {
                          setIsDeleting(true);
                          const result = await deleteRuleAction(
                            emailAccountId,
                            {
                              id: rule.id!,
                            }
                          );
                          if (result?.serverError) {
                            toastError({
                              description: result.serverError,
                            });
                          } else {
                            toastSuccess({
                              description: "The rule has been deleted.",
                            });

                            if (isDialog && onSuccess) {
                              onSuccess();
                            }

                            router.push(
                              prefixPath(
                                emailAccountId,
                                "/automation?tab=rules"
                              )
                            );
                          }
                        } catch {
                          toastError({ description: "Failed to delete rule." });
                        } finally {
                          setIsDeleting(false);
                        }
                      }
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Delete rule
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex space-x-2">
            {onCancel && (
              <Button onClick={onCancel} size="sm" variant="outline">
                Cancel
              </Button>
            )}

            {rule.id ? (
              <Button
                disabled={isDeleting}
                loading={isSubmitting}
                size="sm"
                type="submit"
              >
                Save
              </Button>
            ) : (
              <Button loading={isSubmitting} size="sm" type="submit">
                Create
              </Button>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

function ThreadsExplanation({ size }: { size: "sm" | "md" }) {
  return (
    <TooltipExplanation
      side="right"
      size={size}
      text="When enabled, this rule can apply to the first email and any subsequent replies in a conversation. When disabled, it can only apply to the first email."
    />
  );
}

function allowMultipleConditions(systemType: SystemType | null | undefined) {
  return (
    systemType !== SystemType.COLD_EMAIL &&
    !isConversationStatusType(systemType)
  );
}
