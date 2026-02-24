"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { MessageText } from "@/components/Typography";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Category } from "@/generated/prisma/client";
import { useModal } from "@/hooks/useModal";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createCategoryAction } from "@/utils/actions/categorize";
import {
  type CreateCategoryBody,
  createCategoryBody,
} from "@/utils/actions/categorize.validation";

type ExampleCategory = {
  name: string;
  description: string;
};

const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    name: "Team",
    description:
      "Internal team members with @company.com email addresses, including employees and colleagues within our organization",
  },
  {
    name: "Customer",
    description:
      "Email addresses belonging to customers, including those reaching out for support or engaging with customer success",
  },
  {
    name: "Candidate",
    description:
      "Job applicants, potential hires, and candidates in your interview pipeline",
  },
  {
    name: "Job Application",
    description:
      "Companies, hiring platforms, and recruiters you've applied to or are interviewing with for positions",
  },
  {
    name: "Investor",
    description:
      "Current and potential investors, investment firms, and venture capital contacts",
  },
  {
    name: "Founder",
    description:
      "Startup founders, entrepreneurs, and potential portfolio companies seeking investment or partnerships",
  },
  {
    name: "Vendor",
    description:
      "Service providers, suppliers, and business partners who provide products or services to your company",
  },
  {
    name: "Server Error",
    description: "Automated monitoring services and error reporting systems",
  },
  {
    name: "Press",
    description:
      "Journalists, media outlets, PR agencies, and industry publications seeking interviews or coverage",
  },
  {
    name: "Conference",
    description:
      "Event organizers, conference coordinators, and speaking opportunity contacts for industry events",
  },
  {
    name: "Nonprofit",
    description:
      "Charitable organizations, NGOs, social impact organizations, and philanthropic foundations",
  },
];

export function CreateCategoryButton({
  buttonProps,
}: {
  buttonProps?: ButtonProps;
}) {
  const { isModalOpen, openModal, closeModal, setIsModalOpen } = useModal();

  return (
    <div>
      <Button onClick={openModal} variant="outline" {...buttonProps}>
        {buttonProps?.children ?? (
          <>
            <PlusIcon className="mr-2 size-4" />
            Add
          </>
        )}
      </Button>

      <CreateCategoryDialog
        closeModal={closeModal}
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </div>
  );
}

export function CreateCategoryDialog({
  category,
  isOpen,
  onOpenChange,
  closeModal,
}: {
  category?: Pick<Category, "name" | "description">;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  closeModal: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Category</DialogTitle>
        </DialogHeader>

        <CreateCategoryForm category={category} closeModal={closeModal} />
      </DialogContent>
    </Dialog>
  );
}

function CreateCategoryForm({
  category,
  closeModal,
}: {
  category?: Pick<Category, "name" | "description"> & { id?: string };
  closeModal: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<CreateCategoryBody>({
    resolver: zodResolver(createCategoryBody),
    defaultValues: {
      id: category?.id,
      name: category?.name,
      description: category?.description,
    },
  });

  const handleExampleClick = useCallback(
    (category: ExampleCategory) => {
      setValue("name", category.name);
      setValue("description", category.description);
    },
    [setValue]
  );

  const onSubmit: SubmitHandler<CreateCategoryBody> = useCallback(
    async (data) => {
      const result = await createCategoryAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          description: `There was an error creating the category. ${result.serverError || ""}`,
        });
      } else {
        toastSuccess({ description: "Category created!" });
        closeModal();
      }
    },
    [closeModal, emailAccountId]
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input
        error={errors.name}
        label="Name"
        name="name"
        registerProps={register("name", { required: true })}
        type="text"
      />
      <Input
        autosizeTextarea
        error={errors.description}
        explainText="Additional information used by the AI to categorize senders"
        label="Description (Optional)"
        name="description"
        registerProps={register("description")}
        rows={2}
        type="text"
      />

      <div className="rounded border border-border bg-muted/50 p-3">
        <div className="font-medium text-xs">Examples</div>
        <div className="mt-1 flex flex-wrap gap-2">
          {EXAMPLE_CATEGORIES.map((category) => (
            <Button
              key={category.name}
              onClick={() => handleExampleClick(category)}
              size="xs"
              type="button"
              variant="outline"
            >
              <PlusIcon className="mr-1 size-2" />
              {category.name}
            </Button>
          ))}
        </div>
      </div>

      {category && (
        <MessageText>
          Note: editing a category name/description only impacts future
          categorization. Existing email addresses in this category will not be
          affected.
        </MessageText>
      )}

      <Button loading={isSubmitting} type="submit">
        {category ? "Update" : "Create"}
      </Button>
    </form>
  );
}
