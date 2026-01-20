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
import { Switch } from "@/components/ui/switch";

interface SubcategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  subcategory?: {
    id: string;
    name: string;
    selectionMode: string;
    hidden: boolean;
  };
  onSave: (data: {
    name: string;
    selectionMode: string;
    hidden: boolean;
  }) => Promise<void>;
}

export function SubcategoryDialog({
  open,
  onOpenChange,
  categoryId: _categoryId,
  categoryName,
  subcategory,
  onSave,
}: SubcategoryDialogProps) {
  const [name, setName] = useState("");
  const [selectionMode, setSelectionMode] = useState("pick-many");
  const [hidden, setHidden] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isEdit = !!subcategory;

  // Reset form when dialog opens or subcategory changes
  useEffect(() => {
    if (open) {
      setName(subcategory?.name || "");
      setSelectionMode(subcategory?.selectionMode || "pick-many");
      setHidden(subcategory?.hidden ?? false);
    }
  }, [open, subcategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({ name: name.trim(), selectionMode, hidden });
      onOpenChange(false);
      setName("");
      setSelectionMode("pick-many");
      setHidden(false);
    } catch (error) {
      console.error("Error saving subcategory:", error);
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
              {isEdit ? "Edit Subcategory" : "Add Subcategory"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Update subcategory in "${categoryName}".`
                : `Create a new subcategory in "${categoryName}".`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                autoFocus
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Site Entrances"
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
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <Label htmlFor="hidden">Hidden</Label>
                <p className="text-muted-foreground text-xs">
                  Hide this subcategory from the quote builder
                </p>
              </div>
              <Switch
                checked={hidden}
                id="hidden"
                onCheckedChange={setHidden}
              />
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
