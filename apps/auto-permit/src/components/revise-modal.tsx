import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import type { PermitApplication } from "@/lib/types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

// Revision types for dust permits
const REVISION_TYPES = [
  {
    value: "boundary",
    label: "Boundary/Map Change",
    description: "Update the disturbed area boundary",
  },
  {
    value: "acreage",
    label: "Acreage Change",
    description: "Modify total acreage amount",
  },
  {
    value: "contact",
    label: "Contact Information",
    description: "Update owner/operator contacts",
  },
  {
    value: "schedule",
    label: "Project Schedule",
    description: "Change start/end dates",
  },
  {
    value: "bmp",
    label: "BMP Modifications",
    description: "Update best management practices",
  },
  { value: "other", label: "Other", description: "General revision" },
] as const;

type RevisionType = (typeof REVISION_TYPES)[number]["value"];

interface ReviseModalProps {
  permit: PermitApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    permitId: string,
    revisionType: string,
    notes: string
  ) => Promise<void>;
}

export function ReviseModal({
  permit,
  open,
  onOpenChange,
  onSubmit,
}: ReviseModalProps) {
  const [revisionType, setRevisionType] = useState<RevisionType | "">("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!permit) {
    return null;
  }

  const handleSubmit = async () => {
    if (!revisionType) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(permit.id, revisionType, notes);
      // Reset form on success
      setRevisionType("");
      setNotes("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when closing
      setRevisionType("");
      setNotes("");
    }
    onOpenChange(open);
  };

  const selectedType = REVISION_TYPES.find((t) => t.value === revisionType);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10">
              <FileText className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <DialogTitle>Revise Permit</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {permit.applicationNumber}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Revision Type */}
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="revision-type">
              Revision Type
            </label>
            <Select
              onValueChange={(value) => setRevisionType(value as RevisionType)}
              value={revisionType}
            >
              <SelectTrigger
                className="bg-[--color-bg-secondary]"
                id="revision-type"
              >
                <SelectValue placeholder="Select what's being revised" />
              </SelectTrigger>
              <SelectContent>
                {REVISION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-[--color-text-muted] text-xs">
                {selectedType.description}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="revision-notes">
              Notes{" "}
              <span className="text-[--color-text-muted]">(optional)</span>
            </label>
            <Input
              className="bg-[--color-bg-secondary]"
              id="revision-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the changes..."
              value={notes}
            />
          </div>

          {/* Info */}
          <div className="rounded-lg border border-[--color-border] bg-[--color-bg-primary] p-3">
            <p className="text-[--color-text-muted] text-xs">
              The revision automation will open a browser session, navigate to
              the permit portal, and begin the revision process. You'll be able
              to monitor progress via VNC.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!revisionType || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              "Start Revision"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
