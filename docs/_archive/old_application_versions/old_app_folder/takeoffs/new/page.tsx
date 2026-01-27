"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function NewTakeoffPage() {
  const router = useRouter();
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

      // 3. Update takeoff with PDF reference (not the presigned URL, which expires)
      // We store the object path so the viewer can fetch fresh presigned URLs
      await fetch(`/api/takeoffs/${takeoff.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...takeoff,
          pdf_url: `minio://${uploadData.filename}`,
        }),
      });

      toast.success("Takeoff created successfully");
      router.push(`/takeoffs/${takeoff.id}`);
    } catch (error) {
      console.error("Failed to create takeoff:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create takeoff"
      );
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Takeoffs", href: "/takeoffs" },
          { label: "New Takeoff" },
        ]}
        title="New Takeoff"
      />

      <div className="flex-1 p-6">
        <form className="mx-auto max-w-xl space-y-6" onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Upload Site Plan</CardTitle>
              <CardDescription>
                Upload a PDF of your site plan to start measuring
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Label with htmlFor is accessible */}
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
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              disabled={isUploading}
              onClick={() => router.back()}
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
          </div>
        </form>
      </div>
    </div>
  );
}
