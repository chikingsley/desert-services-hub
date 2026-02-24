"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { GetEmailAccountsResponse } from "@/app/api/user/email-accounts/route";
import { ProfileImage } from "@/components/ProfileImage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { setLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
export function AccountSwitcher() {
  const { data: accountsData } = useAccounts();

  if (!accountsData) {
    return null;
  }

  return <AccountSwitcherInternal emailAccounts={accountsData.emailAccounts} />;
}

export function AccountSwitcherInternal({
  emailAccounts,
}: {
  emailAccounts: GetEmailAccountsResponse["emailAccounts"];
}) {
  const { isMobile } = useSidebar();

  const {
    emailAccountId: activeEmailAccountId,
    emailAccount: activeEmailAccount,
    isLoading,
  } = useAccount();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ emailAccountId?: string }>();

  const getHref = useCallback(
    (emailAccountId: string) => {
      if (!activeEmailAccountId) {
        return `/${emailAccountId}/setup`;
      }

      const basePath = pathname.split("?")[0] || "/";
      const tab = searchParams.get("tab");

      if (params.emailAccountId) {
        const segments = basePath.split("/").filter(Boolean);
        if (segments[0] === params.emailAccountId) {
          segments[0] = emailAccountId;
          const newBasePath = `/${segments.join("/")}`;
          return `${newBasePath}${tab ? `?tab=${tab}` : ""}`;
        }
      }

      return `${basePath}${tab ? `?tab=${tab}` : ""}`;
    },
    [pathname, activeEmailAccountId, params.emailAccountId, searchParams]
  );

  const handleSelect = useCallback(
    async (emailAccountId: string) => {
      try {
        await setLastEmailAccountAction({ emailAccountId });
      } catch {
        // Ignore cookie update failures and continue navigation.
      }

      // Force a hard page reload to refresh all data.
      // I tried to fix with resetting the SWR cache but it didn't seem to work. This is much more reliable anyway.
      window.location.href = getHref(emailAccountId);
    },
    [getHref]
  );

  if (isLoading) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              sidebarName="left-sidebar"
              size="lg"
            >
              {activeEmailAccount ? (
                <>
                  <div className="flex aspect-square size-8 items-center justify-center">
                    <ProfileImage
                      image={activeEmailAccount.image}
                      label={
                        activeEmailAccount.name || activeEmailAccount.email
                      }
                    />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {activeEmailAccount.name || activeEmailAccount.email}
                    </span>
                    {activeEmailAccount.name && (
                      <span className="truncate text-muted-foreground text-xs">
                        {activeEmailAccount.email}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div>Choose account</div>
              )}
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[--radix-dropdown-menu-trigger-width] min-w-80 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Accounts
            </DropdownMenuLabel>
            {emailAccounts.map((emailAccount) => (
              <DropdownMenuItem
                className="gap-2 p-2"
                key={emailAccount.id}
                onSelect={() => {
                  handleSelect(emailAccount.id);
                }}
              >
                <ProfileImage
                  image={emailAccount.image}
                  label={emailAccount.name || emailAccount.email}
                />
                <div className="flex flex-col">
                  <span className="truncate font-medium">
                    {emailAccount.name || emailAccount.email}
                  </span>
                  {emailAccount.name && (
                    <span className="truncate text-muted-foreground text-xs">
                      {emailAccount.email}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <Link href="/accounts">
              <DropdownMenuItem className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Add or manage accounts
                </div>
              </DropdownMenuItem>
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
