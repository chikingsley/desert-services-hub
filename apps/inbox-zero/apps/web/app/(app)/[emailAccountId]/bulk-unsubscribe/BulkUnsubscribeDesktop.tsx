"use client";

import type React from "react";
import {
  ActionCell,
  HeaderButton,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import type { RowProps } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { DomainIcon } from "@/components/charts/DomainIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extractDomainFromEmail } from "@/utils/email";

export function BulkUnsubscribeDesktop({
  tableRows,
  sortColumn,
  sortDirection,
  onSort,
  isAllSelected,
  isSomeSelected,
  onToggleSelectAll,
}: {
  tableRows?: React.ReactNode;
  sortColumn: "emails" | "unread" | "unarchived";
  sortDirection: "asc" | "desc";
  onSort: (column: "emails" | "unread" | "unarchived") => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onToggleSelectAll: () => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pr-0">
            <ButtonCheckbox
              checked={isAllSelected}
              indeterminate={isSomeSelected && !isAllSelected}
              onChange={() => onToggleSelectAll()}
            />
          </TableHead>
          <TableHead className="pl-8">
            <span className="font-medium text-sm">From</span>
          </TableHead>
          <TableHead>
            <HeaderButton
              onClick={() => onSort("emails")}
              sortDirection={
                sortColumn === "emails" ? sortDirection : undefined
              }
              sorted={sortColumn === "emails"}
            >
              Emails
            </HeaderButton>
          </TableHead>
          <TableHead>
            <HeaderButton
              onClick={() => onSort("unread")}
              sortDirection={
                sortColumn === "unread" ? sortDirection : undefined
              }
              sorted={sortColumn === "unread"}
            >
              Read
            </HeaderButton>
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>{tableRows}</TableBody>
    </Table>
  );
}

export function BulkUnsubscribeRowDesktop({
  item,
  refetchPremium,
  selected,
  onSelectRow,
  onDoubleClick,
  hasUnsubscribeAccess,
  mutate,
  onOpenNewsletter,
  labels,
  openPremiumModal,
  userEmail,
  emailAccountId,
  onToggleSelect,
  checked,
  filter,
  readPercentage,
}: RowProps) {
  const domain = extractDomainFromEmail(item.name) || item.name;

  return (
    <TableRow
      aria-selected={selected || undefined}
      className="hover:bg-transparent dark:hover:bg-transparent"
      data-selected={selected || undefined}
      key={item.name}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onSelectRow}
    >
      <TableCell className="w-10 pr-0">
        <ButtonCheckbox
          checked={checked}
          onChange={(shiftKey) => onToggleSelect?.(item.name, shiftKey)}
        />
      </TableCell>
      <TableCell className="max-w-[250px] py-3 pl-8">
        <div className="flex items-center gap-2">
          <DomainIcon domain={domain} size={32} variant="circular" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">
              {item.fromName || item.name}
            </span>
            {item.fromName && (
              <span className="truncate text-muted-foreground text-xs">
                {item.name}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">{item.value}</span>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">
          {Math.round(readPercentage)}%
        </span>
      </TableCell>
      <TableCell className="p-1">
        <div className="flex items-center justify-end gap-2">
          <ActionCell
            emailAccountId={emailAccountId}
            filter={filter}
            hasUnsubscribeAccess={hasUnsubscribeAccess}
            item={item}
            labels={labels}
            mutate={mutate}
            onOpenNewsletter={onOpenNewsletter}
            openPremiumModal={openPremiumModal}
            refetchPremium={refetchPremium}
            selected={selected}
            userEmail={userEmail}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
