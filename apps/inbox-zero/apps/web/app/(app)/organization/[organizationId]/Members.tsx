"use client";

import {
  BarChart3,
  BarChartIcon,
  MoreHorizontal,
  TrashIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import type { OrganizationMembersResponse } from "@/app/api/organizations/[organizationId]/members/route";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { TypographyH3 } from "@/components/Typography";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExecutedRulesCount } from "@/hooks/useExecutedRulesCount";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  cancelInvitationAction,
  removeMemberAction,
} from "@/utils/actions/organization";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

type Member = OrganizationMembersResponse["members"][0];
type PendingInvitation = OrganizationMembersResponse["pendingInvitations"][0];

export function Members({ organizationId }: { organizationId: string }) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } =
    useOrganizationMembers(organizationId);
  const { data: executedRulesData } = useExecutedRulesCount(organizationId);
  const { data: membership } = useOrganizationMembership();
  const isAdmin = hasOrganizationAdminRole(membership?.role ?? "");

  // Create a Map for O(1) lookups instead of O(n) Array.find for each member
  const executedRulesCountMap = useMemo(() => {
    if (!executedRulesData?.memberCounts) {
      return new Map();
    }

    return new Map(
      executedRulesData.memberCounts.map((item) => [
        item.emailAccountId,
        item.executedRulesCount,
      ])
    );
  }, [executedRulesData?.memberCounts]);

  const handleAction = useCallback(
    async (
      action: () => Promise<{ serverError?: string } | undefined>,
      errorTitle: string,
      successMessage: string,
      errorMessage: string
    ) => {
      try {
        const result = await action();

        if (result?.serverError) {
          toastError({
            title: errorTitle,
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: successMessage });
          mutate();
        }
      } catch (err) {
        toastError({
          title: errorTitle,
          description: err instanceof Error ? err.message : errorMessage,
        });
      }
    },
    [mutate]
  );

  const handleRemoveMember = useCallback(
    (memberId: string) =>
      handleAction(
        () => removeMemberAction({ memberId }),
        "Error removing member",
        "Member removed successfully",
        "Failed to remove member"
      ),
    [handleAction]
  );

  const handleCancelInvitation = useCallback(
    (invitationId: string) =>
      handleAction(
        () => cancelInvitationAction({ invitationId }),
        "Error cancelling invitation",
        "Invitation cancelled successfully",
        "Failed to cancel invitation"
      ),
    [handleAction]
  );

  return (
    <LoadingContent error={error} loading={isLoading}>
      <div>
        <div className="flex items-center justify-between">
          <TypographyH3>Members ({data?.members.length || 0})</TypographyH3>
          {isAdmin && (
            <InviteMemberModal
              onSuccess={mutate}
              organizationId={organizationId}
            />
          )}
        </div>

        <div className="mt-4 space-y-4">
          {data?.members.map((member) => {
            const executedRulesCount = executedRulesCountMap.get(
              member.emailAccount.id
            );

            return (
              <MemberCard
                executedRulesCount={executedRulesCount}
                isAdmin={isAdmin}
                key={member.id}
                member={member}
                onRemove={handleRemoveMember}
              />
            );
          })}
        </div>

        {data?.members.length === 0 &&
          (!data?.pendingInvitations ||
            data.pendingInvitations.length === 0) && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                No members found in your organization.
              </p>
            </div>
          )}

        {data?.pendingInvitations && data.pendingInvitations.length > 0 && (
          <div className="mt-8 space-y-4">
            <TypographyH3>
              Pending Invitations ({data.pendingInvitations.length})
            </TypographyH3>
            <div className="space-y-4">
              {data.pendingInvitations.map((invitation) => (
                <PendingInvitationCard
                  invitation={invitation}
                  key={invitation.id}
                  onCancel={handleCancelInvitation}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </LoadingContent>
  );
}

function CardWrapper({
  avatar,
  children,
  actions,
}: {
  avatar: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex min-w-0 flex-1 items-center space-x-4">
        {avatar}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {actions}
    </div>
  );
}

function MemberCard({
  member,
  onRemove,
  executedRulesCount,
  isAdmin,
}: {
  member: Member;
  onRemove: (memberId: string) => void;
  executedRulesCount?: number;
  isAdmin: boolean;
}) {
  const { emailAccountId } = useAccount();

  return (
    <CardWrapper
      actions={
        isAdmin &&
        member.emailAccount.id !== emailAccountId &&
        member.emailAccount.id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRemove(member.id)}>
                <TrashIcon className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
              {member.allowOrgAdminAnalytics && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/${member.emailAccount.id}/stats`}>
                      <BarChart3 className="mr-2 size-4" />
                      Analytics
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/${member.emailAccount.id}/usage`}>
                      <BarChartIcon className="mr-2 size-4" />
                      Usage
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
      avatar={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage
                  alt={member.emailAccount.name || member.emailAccount.email}
                  src={member.emailAccount.image || ""}
                />
                <AvatarFallback>
                  {getInitials(
                    member.emailAccount.name,
                    member.emailAccount.email
                  )}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Joined at: {new Date(member.createdAt).toLocaleDateString()}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
    >
      <div className="flex items-center space-x-3">
        <p className="font-medium">{member.emailAccount.name || "No name"}</p>
        <Badge
          className="text-xs"
          variant={member.role === "admin" ? "default" : "secondary"}
        >
          {capitalizeRole(member.role)}
        </Badge>
      </div>
      <div className="mt-1 flex items-center space-x-3">
        <span className="text-muted-foreground text-xs">
          {member.emailAccount.email}
        </span>
        {executedRulesCount !== undefined && (
          <>
            <span className="text-muted-foreground text-xs">∣</span>
            <span className="text-muted-foreground text-xs">
              {executedRulesCount.toLocaleString()} assistant processed emails
            </span>
          </>
        )}
      </div>
    </CardWrapper>
  );
}

function PendingInvitationCard({
  invitation,
  onCancel,
}: {
  invitation: PendingInvitation;
  onCancel: (invitationId: string) => void;
}) {
  return (
    <CardWrapper
      actions={
        <Button
          onClick={() => onCancel(invitation.id)}
          size="sm"
          variant="outline"
        >
          <XIcon className="mr-2 size-4" />
          Cancel
        </Button>
      }
      avatar={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback>
                  {invitation.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Expires at:{" "}
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
    >
      <div className="flex items-center space-x-3">
        <p className="font-medium">{invitation.email}</p>
        <Badge className="text-xs" variant="outline">
          Pending
        </Badge>
        {invitation.role && (
          <Badge className="text-xs" variant="secondary">
            {capitalizeRole(invitation.role)}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex items-center space-x-3">
        <span className="text-muted-foreground text-xs">
          Invited by {invitation.inviter.name || invitation.inviter.email}
        </span>
      </div>
    </CardWrapper>
  );
}

function capitalizeRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getInitials(name: string | null | undefined, email: string) {
  return name ? name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
}
