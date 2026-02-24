"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import groupBy from "lodash/groupBy";
import {
  ArchiveIcon,
  BookmarkXIcon,
  ChevronRight,
  MoreVerticalIcon,
  PencilIcon,
} from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { Fragment, useMemo } from "react";
import { CreateCategoryDialog } from "@/app/(app)/[emailAccountId]/smart-categories/CreateCategoryButton";
import { CategorySelect } from "@/components/CategorySelect";
import { EmailCell } from "@/components/EmailCell";
import { toastError, toastSuccess } from "@/components/Toast";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { useThreads } from "@/hooks/useThreads";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  addToArchiveSenderQueue,
  useArchiveSenderStatus,
} from "@/store/archive-sender-queue";
import { cn } from "@/utils";
import {
  changeSenderCategoryAction,
  removeAllFromCategoryAction,
} from "@/utils/actions/categorize";
import type { CategoryWithRules } from "@/utils/category.server";
import { formatShortDate } from "@/utils/date";
import { decodeSnippet } from "@/utils/gmail/decode";
import { getEmailUrl, getGmailSearchUrl } from "@/utils/url";

const COLUMNS = 4;

type EmailGroup = {
  address: string;
  name?: string | null;
  category: CategoryWithRules | null;
  meta?: { width?: string };
};

export function GroupedTable({
  emailGroups,
  categories,
}: {
  emailGroups: EmailGroup[];
  categories: CategoryWithRules[];
}) {
  const { emailAccountId, userEmail } = useAccount();

  const categoryMap = useMemo(() => {
    return categories.reduce<Record<string, CategoryWithRules>>(
      (acc, category) => {
        acc[category.name] = category;
        return acc;
      },
      {}
    );
  }, [categories]);

  const groupedEmails = useMemo(() => {
    const grouped = groupBy(
      emailGroups,
      (group) =>
        categoryMap[group.category?.name || ""]?.name || "Uncategorized"
    );

    // Add empty arrays for categories without any emails
    for (const category of categories) {
      if (!grouped[category.name]) {
        grouped[category.name] = [];
      }
    }

    return grouped;
  }, [emailGroups, categories, categoryMap]);

  const [expanded, setExpanded] = useQueryState("expanded", {
    parse: (value) => value.split(","),
    serialize: (value) => value.join(","),
  });

  const columns: ColumnDef<EmailGroup>[] = useMemo(
    () => [
      {
        id: "expander",
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <button
              className="p-2"
              onClick={row.getToggleExpandedHandler()}
              type="button"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transform transition-all duration-300 ease-in-out",
                  row.getIsExpanded() ? "rotate-90" : "rotate-0"
                )}
              />
            </button>
          ) : null;
        },
        meta: { size: "20px" },
      },
      {
        accessorKey: "address",
        cell: ({ row }) => (
          <Link
            className="hover:underline"
            href={getGmailSearchUrl(row.original.address, userEmail)}
            target="_blank"
          >
            <div className="flex items-center justify-between">
              <EmailCell
                className="flex gap-2"
                emailAddress={row.original.address}
              />
            </div>
          </Link>
        ),
      },
      {
        accessorKey: "preview",
        cell: ({ row }) => {
          return <ArchiveStatusCell sender={row.original.address} />;
        },
      },
      {
        accessorKey: "date",
        cell: ({ row }) => (
          <Select
            defaultValue={row.original.category?.id || ""}
            onValueChange={async (value) => {
              const result = await changeSenderCategoryAction(emailAccountId, {
                sender: row.original.address,
                categoryId: value,
              });

              if (result?.serverError) {
                toastError({ description: result.serverError });
              } else {
                toastSuccess({ description: "Category changed" });
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id.toString()}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
    ],
    [categories, userEmail, emailAccountId]
  );

  const table = useReactTable({
    data: emailGroups,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const [selectedCategoryName, setSelectedCategoryName] =
    useQueryState("categoryName");

  return (
    <>
      <Table>
        <TableBody>
          {Object.entries(groupedEmails).map(([categoryName, senders]) => {
            const isCategoryExpanded = expanded?.includes(categoryName);

            const onArchiveAll = async () => {
              for (const sender of senders) {
                await addToArchiveSenderQueue({
                  sender: sender.address,
                  emailAccountId,
                });
              }
            };

            const onEditCategory = () => {
              setSelectedCategoryName(categoryName);
            };

            const onRemoveAllFromCategory = async () => {
              const yes = confirm(
                "This will remove all emails from this category. You can re-categorize them later. Do you want to continue?"
              );
              if (!yes) {
                return;
              }
              const result = await removeAllFromCategoryAction(emailAccountId, {
                categoryName,
              });

              if (result?.serverError) {
                toastError({ description: result.serverError });
              } else {
                toastSuccess({
                  description: "All emails removed from category",
                });
              }
            };

            const category = categoryMap[categoryName];

            if (!category) {
              return null;
            }

            return (
              <Fragment key={categoryName}>
                <GroupRow
                  category={category}
                  count={senders.length}
                  isExpanded={!!isCategoryExpanded}
                  onArchiveAll={onArchiveAll}
                  onEditCategory={onEditCategory}
                  onRemoveAllFromCategory={onRemoveAllFromCategory}
                  onToggle={() => {
                    setExpanded((prev) =>
                      isCategoryExpanded
                        ? (prev || []).filter((c) => c !== categoryName)
                        : [...(prev || []), categoryName]
                    );
                  }}
                />
                {isCategoryExpanded && (
                  <SenderRows
                    senders={senders}
                    table={table}
                    userEmail={userEmail}
                  />
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <CreateCategoryDialog
        category={
          selectedCategoryName
            ? categories.find((c) => c.name === selectedCategoryName)
            : undefined
        }
        closeModal={() => setSelectedCategoryName(null)}
        isOpen={selectedCategoryName !== null}
        onOpenChange={(open) =>
          setSelectedCategoryName(open ? selectedCategoryName : null)
        }
      />
    </>
  );
}

export function SendersTable({
  senders,
  categories,
}: {
  senders: EmailGroup[];
  categories: CategoryWithRules[];
}) {
  const { emailAccountId, userEmail } = useAccount();

  const columns: ColumnDef<EmailGroup>[] = useMemo(
    () => [
      {
        id: "expander",
        cell: ({ row }) => {
          return row.getCanExpand() ? (
            <button
              className="p-2"
              onClick={row.getToggleExpandedHandler()}
              type="button"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transform transition-all duration-300 ease-in-out",
                  row.getIsExpanded() ? "rotate-90" : "rotate-0"
                )}
              />
            </button>
          ) : null;
        },
        meta: { size: "20px" },
      },
      {
        accessorKey: "address",
        cell: ({ row }) => (
          <div className="flex items-center justify-between">
            <EmailCell
              className="flex gap-2"
              emailAddress={row.original.address}
              name={row.original.name}
            />
          </div>
        ),
      },
      {
        accessorKey: "preview",
      },
      {
        accessorKey: "category",
        cell: ({ row }) => {
          return (
            <CategorySelect
              categories={categories}
              emailAccountId={emailAccountId}
              sender={row.original.address}
              senderCategory={row.original.category}
            />
          );
        },
      },
    ],
    [categories, emailAccountId]
  );

  const table = useReactTable({
    data: senders,
    columns,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <Table>
      <TableBody>
        <SenderRows senders={senders} table={table} userEmail={userEmail} />
      </TableBody>
    </Table>
  );
}

function GroupRow({
  category,
  count,
  isExpanded,
  onToggle,
  onArchiveAll,
  onEditCategory,
  onRemoveAllFromCategory,
}: {
  category: CategoryWithRules;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onArchiveAll: () => void;
  onEditCategory: () => void;
  onRemoveAllFromCategory: () => void;
}) {
  return (
    <TableRow className="h-8 cursor-pointer bg-muted/50">
      <TableCell
        className="py-1 font-medium text-foreground text-sm"
        colSpan={3}
        onClick={onToggle}
      >
        <div className="flex items-center">
          <ChevronRight
            className={cn(
              "mr-2 size-4 transform transition-all duration-300 ease-in-out",
              isExpanded ? "rotate-90" : "rotate-0"
            )}
          />
          {category.name}
          <span className="ml-2 text-muted-foreground text-xs">({count})</span>
        </div>
      </TableCell>
      <TableCell className="flex justify-end gap-1.5 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost">
              <MoreVerticalIcon className="size-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEditCategory}>
              <PencilIcon className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRemoveAllFromCategory}>
              <BookmarkXIcon className="mr-2 size-4" />
              Remove All From Category
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={onArchiveAll} size="xs" variant="outline">
          <ArchiveIcon className="mr-2 size-4" />
          Archive all
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SenderRows({
  table,
  senders,
  userEmail,
}: {
  table: ReturnType<typeof useReactTable<EmailGroup>>;
  senders: EmailGroup[];
  userEmail: string;
}) {
  if (!senders.length) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>
          <MessageText>This category is empty</MessageText>
        </TableCell>
      </TableRow>
    );
  }

  return senders.map((sender) => {
    const row = table
      .getRowModel()
      .rows.find((r) => r.original.address === sender.address);
    if (!row) {
      return null;
    }
    return (
      <Fragment key={row.id}>
        <TableRow>
          {row.getVisibleCells().map((cell) => (
            <TableCell
              className="py-1"
              key={cell.id}
              style={{
                width: (cell.column.columnDef.meta as any)?.size || "auto",
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
        {row.getIsExpanded() && (
          <ExpandedRows sender={row.original.address} userEmail={userEmail} />
        )}
      </Fragment>
    );
  });
}

function ExpandedRows({
  sender,
  userEmail,
}: {
  sender: string;
  userEmail: string;
}) {
  const { provider } = useAccount();

  const { data, isLoading, error } = useThreads({
    fromEmail: sender,
    limit: 5,
    type: "all",
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>
          <Skeleton className="h-10 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>Error loading emails</TableCell>
      </TableRow>
    );
  }

  if (!data?.threads.length) {
    return (
      <TableRow>
        <TableCell colSpan={COLUMNS}>No emails found</TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.threads.map((thread) => {
        const firstMessage = thread.messages[0];
        const subject = firstMessage.subject;
        const date = firstMessage.date;

        return (
          <TableRow className="bg-muted/50" key={thread.id}>
            <TableCell className="py-3">
              <ViewEmailButton messageId={thread.id} threadId={thread.id} />
            </TableCell>
            <TableCell className="py-3">
              <Link
                className="hover:underline"
                href={getEmailUrl(thread.id, userEmail, provider)}
                target="_blank"
              >
                {subject}
              </Link>
            </TableCell>
            <TableCell className="py-3">
              {decodeSnippet(thread.messages[0].snippet)}
            </TableCell>
            <TableCell className="text-nowrap py-3">
              {formatShortDate(new Date(date))}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

function ArchiveStatusCell({ sender }: { sender: string }) {
  const status = useArchiveSenderStatus(sender);

  switch (status?.status) {
    case "completed":
      if (status.threadsTotal) {
        return (
          <span className="text-green-500">
            Archived {status.threadsTotal} emails!
          </span>
        );
      }
      return <span className="text-muted-foreground">Archived</span>;
    case "processing":
      return (
        <span className="text-blue-500">
          Archiving... {status.threadsTotal - status.threadIds.length} /{" "}
          {status.threadsTotal}
        </span>
      );
    case "pending":
      return <span className="text-muted-foreground">Pending...</span>;
    default:
      return null;
  }
}
