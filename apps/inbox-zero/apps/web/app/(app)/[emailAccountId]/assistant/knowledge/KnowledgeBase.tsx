"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { KnowledgeForm } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeForm";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Knowledge } from "@/generated/prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import { deleteKnowledgeAction } from "@/utils/actions/knowledge";
import { formatDateSimple } from "@/utils/date";

export function KnowledgeBase() {
  const { emailAccountId } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Knowledge | null>(null);
  const { data, isLoading, error, mutate } =
    useSWR<GetKnowledgeResponse>("/api/knowledge");

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setEditingItem(null);
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingItem(null);
    }
    setIsOpen(open);
  }, []);

  return (
    <div>
      <Dialog onOpenChange={onOpenChange} open={isOpen || !!editingItem}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Knowledge" : "Add Knowledge"}
            </DialogTitle>
          </DialogHeader>
          <KnowledgeForm
            closeDialog={handleClose}
            editingItem={editingItem}
            knowledgeItemsCount={data?.items.length || 0}
            refetch={mutate}
          />
        </DialogContent>
      </Dialog>

      <Card className="mt-2">
        <LoadingContent error={error} loading={isLoading}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>No knowledge entries yet</EmptyTitle>
                        <EmptyDescription>
                          Add information about your work, projects, or
                          preferences. The assistant uses this when drafting
                          replies.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((item) => (
                  <KnowledgeTableRow
                    emailAccountId={emailAccountId}
                    item={item}
                    key={item.id}
                    onDelete={mutate}
                    onEdit={() => setEditingItem(item)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </LoadingContent>
      </Card>
    </div>
  );
}

function KnowledgeTableRow({
  item,
  onEdit,
  onDelete,
  emailAccountId,
}: {
  item: Knowledge;
  onEdit: () => void;
  onDelete: () => void;
  emailAccountId: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <TableRow>
      <TableCell>{item.title}</TableCell>
      <TableCell>{formatDateSimple(new Date(item.updatedAt))}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onEdit} size="sm" variant="outline">
            Edit
          </Button>
          <ConfirmDialog
            confirmText="Delete"
            description={`Are you sure you want to delete "${item.title}"? This action cannot be undone.`}
            onConfirm={async () => {
              try {
                setIsDeleting(true);
                const result = await deleteKnowledgeAction(emailAccountId, {
                  id: item.id,
                });
                if (result?.serverError) {
                  toastError({
                    title: "Error deleting knowledge base entry",
                    description: result.serverError || "",
                  });
                  return;
                }
                toastSuccess({
                  description: "Knowledge base entry deleted successfully",
                });
                onDelete();
              } finally {
                setIsDeleting(false);
              }
            }}
            title="Delete Knowledge Base Entry"
            trigger={
              <Button loading={isDeleting} size="sm" variant="outline">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
