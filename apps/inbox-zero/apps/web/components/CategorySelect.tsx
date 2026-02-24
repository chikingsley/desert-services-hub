"use client";

import { LoadingMiniSpinner } from "@/components/Loading";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/generated/prisma/client";
import { useAiCategorizationQueueItem } from "@/store/ai-categorize-sender-queue";
import { changeSenderCategoryAction } from "@/utils/actions/categorize";

export function CategorySelect({
  emailAccountId,
  sender,
  senderCategory,
  categories,
  onSuccess,
}: {
  emailAccountId: string;
  sender: string;
  senderCategory: Pick<Category, "id"> | null;
  categories: Pick<Category, "id" | "name">[];
  onSuccess?: (categoryId: string) => void;
}) {
  const item = useAiCategorizationQueueItem(sender);

  if (item?.status && item?.status !== "completed") {
    return (
      <span className="flex items-center text-muted-foreground">
        <LoadingMiniSpinner />
        <span className="ml-2">Categorizing...</span>
      </span>
    );
  }

  return (
    <Select
      defaultValue={item?.categoryId || senderCategory?.id || ""}
      onValueChange={async (value) => {
        const result = await changeSenderCategoryAction(emailAccountId, {
          sender,
          categoryId: value,
        });

        if (result?.serverError) {
          toastError({ description: result.serverError });
        } else {
          toastSuccess({ description: "Category changed" });
          onSuccess?.(value);
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
  );
}
