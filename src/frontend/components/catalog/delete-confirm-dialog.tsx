"use client";

import { AlertTriangle } from "lucide-react";
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

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  isLoading = false,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const confirmPhrase = "DELETE";
  const isConfirmed = confirmText === confirmPhrase;

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setConfirmText("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (isConfirmed) {
      onConfirm();
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="font-display">{title}</DialogTitle>
              <DialogDescription className="mt-1">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm">
              You are about to delete{" "}
              <span className="font-semibold text-foreground">{itemName}</span>.
              This action cannot be undone.
            </p>
          </div>

          <div className="grid gap-2">
            <Label className="text-sm" htmlFor="confirm-delete">
              Type{" "}
              <span className="font-bold font-mono text-destructive">
                {confirmPhrase}
              </span>{" "}
              to confirm
            </Label>
            <Input
              autoComplete="off"
              autoFocus
              className="font-mono"
              id="confirm-delete"
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              value={confirmText}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!isConfirmed || isLoading}
            onClick={handleConfirm}
            type="button"
            variant="destructive"
          >
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
