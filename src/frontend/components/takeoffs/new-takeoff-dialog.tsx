import { Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

function getDropzoneClasses(isDragging: boolean, hasFile: boolean) {
  if (isDragging) {
    return "border-primary bg-primary/5";
  }
  if (hasFile) {
    return "border-green-500 bg-green-50 dark:bg-green-950/20";
  }
  return "border-muted-foreground/25 hover:border-primary";
}

interface NewTakeoffDialogProps {
  children: React.ReactNode;
}

export function NewTakeoffDialog({ children }: NewTakeoffDialogProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile?.type === "application/pdf") {
        setFile(droppedFile);
        if (!name) {
          setName(droppedFile.name.replace(".pdf", ""));
        }
      }
    },
    [name]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace(".pdf", ""));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || isUploading) {
      return;
    }

    setIsUploading(true);

    try {
      // 1. Create takeoff record first to get the ID
      const createRes = await fetch("/api/takeoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, status: "draft" }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to create takeoff");
      }

      const takeoff = await createRes.json();

      // 2. Upload PDF to MinIO AIStor
      const formData = new FormData();
      formData.append("file", file);
      formData.append("takeoffId", takeoff.id);
      formData.append("filename", "original.pdf");

      const uploadRes = await fetch("/api/upload/pdf", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const error = await uploadRes.json();
        throw new Error(error.error || "Failed to upload PDF");
      }

      const uploadData = await uploadRes.json();

      // 3. Update takeoff with PDF reference
      await fetch(`/api/takeoffs/${takeoff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...takeoff,
          pdf_url: `minio://${uploadData.filename}`,
        }),
      });

      toast.success("Takeoff created successfully");
      setOpen(false);
      navigate(`/takeoffs/${takeoff.id}`);
    } catch (error) {
      console.error("Failed to create takeoff:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create takeoff"
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upload Site Plan</DialogTitle>
            <DialogDescription>
              Upload a PDF of your site plan to start measuring
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Takeoff Name</Label>
              <Input
                disabled={isUploading}
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 123 Main St - Site Plan"
                value={name}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pdf-input">PDF File</Label>
              <label
                className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${getDropzoneClasses(isDragging, !!file)} ${isUploading ? "pointer-events-none opacity-50" : ""}`}
                htmlFor="pdf-input"
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDrop={handleDrop}
              >
                <input
                  accept="application/pdf"
                  className="sr-only"
                  disabled={isUploading}
                  id="pdf-input"
                  onChange={handleFileChange}
                  type="file"
                />
                <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
                {file ? (
                  <p className="font-medium text-green-600 text-sm">
                    {file.name}
                  </p>
                ) : (
                  <>
                    <p className="font-medium text-sm">
                      Drop PDF here or click to upload
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Supports PDF files only
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isUploading}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!(file && name) || isUploading} type="submit">
              {isUploading ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Uploading...
                </>
              ) : (
                "Start Takeoff"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
