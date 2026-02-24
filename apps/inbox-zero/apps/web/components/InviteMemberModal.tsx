"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { TagInput } from "@/components/TagInput";
import { toastError, toastSuccess } from "@/components/Toast";
import { TooltipExplanation } from "@/components/TooltipExplanation";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDialogState } from "@/hooks/useDialogState";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  createOrganizationAndInviteAction,
  inviteMemberAction,
} from "@/utils/actions/organization";
import {
  type InviteMemberBody,
  inviteMemberBody,
} from "@/utils/actions/organization.validation";
import { isValidEmail } from "@/utils/email";

export function InviteMemberModal({
  organizationId,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: {
  organizationId?: string;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const internalState = useDialogState();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalState.isOpen;
  const onOpenChange = isControlled
    ? controlledOnOpenChange
    : internalState.onToggle;
  const onClose = isControlled
    ? () => controlledOnOpenChange?.(false)
    : internalState.onClose;

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      {trigger !== null &&
        (trigger ?? (
          <DialogTrigger asChild>
            <Button size="sm">Invite Member</Button>
          </DialogTrigger>
        ))}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {organizationId ? "Invite Member" : "Invite Members"}
          </DialogTitle>
          <DialogDescription>
            {organizationId
              ? "Send an invitation to join your organization."
              : "Enter email addresses to invite team members."}
          </DialogDescription>
        </DialogHeader>

        {organizationId ? (
          <InviteForm
            onClose={onClose}
            onSuccess={onSuccess}
            organizationId={organizationId}
          />
        ) : (
          <CreateOrgAndInviteForm onClose={onClose} onSuccess={onSuccess} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  organizationId,
  onClose,
  onSuccess,
}: {
  organizationId: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<InviteMemberBody>({
    resolver: zodResolver(inviteMemberBody),
    defaultValues: {
      organizationId,
      role: "member",
    },
  });

  const selectedRole = watch("role");

  const onSubmit: SubmitHandler<InviteMemberBody> = useCallback(
    async (data) => {
      const result = await inviteMemberAction(data);

      if (result?.serverError) {
        toastError({
          title: "Error sending invitation",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: "Invitation sent successfully!",
        });
        reset();
        onClose();
        onSuccess?.();
      }
    },
    [reset, onClose, onSuccess]
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        error={errors.email}
        label="Email Address"
        name="email"
        placeholder="john.doe@example.com"
        registerProps={register("email")}
        type="email"
      />

      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="role">Role</Label>
          <TooltipExplanation
            side="right"
            text="Members can view and collaborate.\nAdmins can manage the organization and invite others."
          />
        </div>
        <Select
          onValueChange={(value) =>
            setValue("role", value as "admin" | "member")
          }
          value={selectedRole}
        >
          <SelectTrigger id="role">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button loading={isSubmitting} type="submit">
          Send Invitation
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateOrgAndInviteForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailsChange = useCallback((newEmails: string[]) => {
    setEmails(newEmails.map((e) => e.toLowerCase()));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (emails.length === 0) {
      toastError({ description: "Please enter at least one email address" });
      return;
    }

    setIsSubmitting(true);

    const result = await createOrganizationAndInviteAction(emailAccountId, {
      emails,
    });

    setIsSubmitting(false);

    if (result?.serverError) {
      toastError({
        description: "Failed to create organization and send invitations",
      });
    } else if (result?.data) {
      const successCount = result.data.results.filter((r) => r.success).length;
      const errorCount = result.data.results.filter((r) => !r.success).length;

      if (successCount > 0) {
        toastSuccess({
          description: `${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully!`,
        });
      }
      if (errorCount > 0) {
        toastError({
          description: `Failed to send ${errorCount} invitation${errorCount > 1 ? "s" : ""}`,
        });
      }

      setEmails([]);
      onClose();
      onSuccess?.();
    }
  }, [emails, emailAccountId, onClose, onSuccess]);

  return (
    <div className="space-y-4">
      <TagInput
        id="email-input"
        label="Email addresses"
        onChange={handleEmailsChange}
        placeholder="Enter email addresses separated by commas"
        validate={(email) =>
          isValidEmail(email) ? null : "Please enter a valid email address"
        }
        value={emails}
      />

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          disabled={emails.length === 0}
          loading={isSubmitting}
          onClick={handleSubmit}
          type="button"
        >
          Send Invitation{emails.length > 1 ? "s" : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}
