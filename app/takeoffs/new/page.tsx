"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
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
import { setTakeoffData } from "@/lib/takeoff-store";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      return;
    }

    // TODO: Upload file to Supabase storage and create takeoff record
    // For now, we'll use in-memory store and navigate to the editor
    const tempId = crypto.randomUUID();

    // Store file in memory for the editor
    const reader = new FileReader();
    reader.onload = () => {
      setTakeoffData(tempId, {
        file: reader.result as string,
        name,
      });
      router.push(`/takeoffs/${tempId}`);
    };
    reader.readAsDataURL(file);
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
                  className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${getDropzoneClasses(isDragging, !!file)}`}
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
              onClick={() => router.back()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!(file && name)} type="submit">
              Start Takeoff
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
