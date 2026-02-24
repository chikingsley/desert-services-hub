"use client";

import uniqBy from "lodash/uniqBy";
import { PenIcon, PlusIcon, TagsIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import {
  CreateCategoryButton,
  CreateCategoryDialog,
} from "@/app/(app)/[emailAccountId]/smart-categories/CreateCategoryButton";
import { TypographyH4 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Category } from "@/generated/prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  deleteCategoryAction,
  upsertDefaultCategoriesAction,
} from "@/utils/actions/categorize";
import { defaultCategory } from "@/utils/categories";
import { prefixPath } from "@/utils/path";

type CardCategory = Pick<Category, "name" | "description"> & {
  id?: string;
  enabled?: boolean;
  isDefault?: boolean;
};

const defaultCategories = Object.values(defaultCategory).map((c) => ({
  name: c.name,
  description: c.description,
  enabled: c.enabled,
  isDefault: true,
}));

export function SetUpCategories({
  existingCategories,
}: {
  existingCategories: CardCategory[];
}) {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const [selectedCategoryName, setSelectedCategoryName] =
    useQueryState("category-name");

  const { emailAccountId } = useAccount();

  const combinedCategories = uniqBy(
    [
      ...defaultCategories.map((c) => {
        const existing = existingCategories.find((e) => e.name === c.name);

        if (existing) {
          return {
            ...existing,
            enabled: true,
            isDefault: false,
          };
        }

        return {
          ...c,
          id: undefined,
          // only enable on first set up
          enabled: c.enabled && !existingCategories.length,
        };
      }),
      ...existingCategories,
    ],
    (c) => c.name
  );

  const [categories, setCategories] = useState<Map<string, boolean>>(
    new Map(
      combinedCategories.map((c) => [c.name, !c.isDefault || !!c.enabled])
    )
  );

  // Update categories when existingCategories changes
  // This is a bit messy that we need to do this
  useEffect(() => {
    setCategories((prevCategories) => {
      const newCategories = new Map(prevCategories);

      // Enable any new categories from existingCategories that aren't in the current map
      for (const category of existingCategories) {
        if (!prevCategories.has(category.name)) {
          newCategories.set(category.name, true);
        }
      }

      // Disable any categories that aren't in existingCategories
      if (existingCategories.length) {
        for (const category of prevCategories.keys()) {
          if (!existingCategories.some((c) => c.name === category)) {
            newCategories.set(category, false);
          }
        }
      }

      return newCategories;
    });
  }, [existingCategories]);

  return (
    <>
      <Card className="m-4">
        <CardHeader>
          <CardTitle>Set up sender categories</CardTitle>
          <CardDescription className="max-w-sm">
            Automatically categorize senders for bulk archiving and AI
            assistant.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <TypographyH4>Choose categories</TypographyH4>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
            {combinedCategories.map((category) => {
              return (
                <CategoryCard
                  category={category}
                  isEnabled={categories.get(category.name) ?? false}
                  key={category.name}
                  onAdd={() =>
                    setCategories(
                      new Map(categories.entries()).set(category.name, true)
                    )
                  }
                  onEdit={() => setSelectedCategoryName(category.name)}
                  onRemove={async () => {
                    if (category.id) {
                      await deleteCategoryAction(emailAccountId, {
                        categoryId: category.id,
                      });
                    } else {
                      setCategories(
                        new Map(categories.entries()).set(category.name, false)
                      );
                    }
                  }}
                />
              );
            })}
          </div>

          <div className="mt-4 flex gap-2">
            <CreateCategoryButton
              buttonProps={{
                children: (
                  <>
                    <PenIcon className="mr-2 size-4" />
                    Add your own
                  </>
                ),
              }}
            />
            <Button
              loading={isCreating}
              onClick={async () => {
                setIsCreating(true);
                const upsertCategories = Array.from(categories.entries()).map(
                  ([name, enabled]) => ({
                    id: combinedCategories.find((c) => c.name === name)?.id,
                    name,
                    enabled,
                  })
                );

                await upsertDefaultCategoriesAction(emailAccountId, {
                  categories: upsertCategories,
                });
                setIsCreating(false);
                router.push(prefixPath(emailAccountId, "/smart-categories"));
              }}
            >
              <TagsIcon className="mr-2 h-4 w-4" />
              {existingCategories.length > 0 ? "Save" : "Create categories"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <CreateCategoryDialog
        category={
          selectedCategoryName
            ? combinedCategories.find((c) => c.name === selectedCategoryName)
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

function CategoryCard({
  category,
  isEnabled,
  onAdd,
  onRemove,
  onEdit,
}: {
  category: CardCategory;
  isEnabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex items-center justify-between gap-2 p-4",
        !isEnabled && "bg-muted/50"
      )}
    >
      <div>
        <div className="text-sm">{category.name}</div>
        {/* <div className="mt-1 text-xs text-muted-foreground">
          {category.description}
        </div> */}
      </div>
      {isEnabled ? (
        <div className="flex gap-1">
          <Button onClick={onEdit} size="iconSm" variant="ghost">
            <PenIcon className="size-4" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button onClick={onRemove} size="iconSm" variant="ghost">
            <TrashIcon className="size-4" />
            <span className="sr-only">Remove</span>
          </Button>
        </div>
      ) : (
        <Button onClick={onAdd} size="iconSm" variant="outline">
          <PlusIcon className="size-4" />
          <span className="sr-only">Add</span>
        </Button>
      )}
    </Card>
  );
}
