"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: {
    id: string;
    name: string;
    selectionMode: string;
  };
  onSave: (data: { name: string; selectionMode: string }) => Promise<void>;
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  onSave,
}: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [selectionMode, setSelectionMode] = useState("pick-many");
  const [isLoading, setIsLoading] = useState(false);

  const isEdit = !!category;

  // Reset form when dialog opens or category changes
  useEffect(() => {
    if (open) {
      setName(category?.name || "");
      setSelectionMode(category?.selectionMode || "pick-many");
    }
  }, [open, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({ name: name.trim(), selectionMode });
      onOpenChange(false);
      setName("");
      setSelectionMode("pick-many");
    } catch (error) {
      console.error("Error saving category:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get button text without nested ternary
  const getButtonText = () => {
    if (isLoading) {
      return "Saving...";
    }
    if (isEdit) {
      return "Update";
    }
    return "Create";
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display">
              {isEdit ? "Edit Category" : "Add Category"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the category details."
                : "Create a new service category."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                autoFocus
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 1. SWPPP Compliance"
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="selectionMode">Selection Mode</Label>
              <Select onValueChange={setSelectionMode} value={selectionMode}>
                <SelectTrigger id="selectionMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pick-many">Pick Many</SelectItem>
                  <SelectItem value="pick-one">Pick One</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {selectionMode === "pick-one"
                  ? "Users can only select one item from this category."
                  : "Users can select multiple items from this category."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!name.trim() || isLoading} type="submit">
              {getButtonText()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
