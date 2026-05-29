"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ServiceRequestFormValues,
  serviceRequestFormSchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

const SERVICE_OPTIONS = [
  "Stormwater Management (SWPPP)",
  "Temporary Fencing",
  "Portable Restrooms",
  "Roll-off Containers",
  "Street Sweeping",
  "Water Trucks & Dust Control",
  "Site Cleaning / Finishing",
] as const;

export function ServiceRequestForm({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ServiceRequestFormValues>({
    resolver: zodResolver(serviceRequestFormSchema),
    defaultValues: {
      servicesRequested: [],
    },
  });

  const servicesRequested = watch("servicesRequested") ?? [];

  function toggleService(service: string) {
    const current = servicesRequested;
    const next = current.includes(service)
      ? current.filter((s) => s !== service)
      : [...current, service];
    setValue("servicesRequested", next);
  }

  function onSubmit(data: ServiceRequestFormValues) {
    startTransition(async () => {
      try {
        const formData = new FormData();

        for (const [key, value] of Object.entries(data)) {
          if (key === "servicesRequested" && Array.isArray(value)) {
            for (const s of value) {
              formData.append("servicesRequested[]", s);
            }
          } else if (value !== undefined) {
            formData.append(key, String(value));
          }
        }

        const files = fileInputRef.current?.files;
        if (files) {
          for (const file of Array.from(files)) {
            formData.append("constructionPlans[]", file);
          }
        }

        const res = await fetch("/api/forms/service-request", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          setStatus("success");
          reset();
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    });
  }

  if (status === "success") {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/50 p-8 text-center",
          className
        )}
      >
        <h3 className="font-bold font-heading text-xl">Thank You</h3>
        <p className="mt-2 text-muted-foreground">
          Your service request has been submitted. Our team will review your
          request and get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      className={cn("space-y-6", className)}
      onSubmit={handleSubmit(onSubmit)}
    >
      {/* Honeypot */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <input
          autoComplete="off"
          tabIndex={-1}
          type="text"
          {...register("honeypot")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="generalContractor">General Contractor</Label>
        <Input
          id="generalContractor"
          placeholder="General contractor name"
          {...register("generalContractor")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="projectName">Project Name *</Label>
        <Input
          id="projectName"
          placeholder="Project name"
          {...register("projectName")}
          aria-invalid={errors.projectName ? "true" : undefined}
        />
        {errors.projectName && (
          <p className="text-destructive text-sm">
            {errors.projectName.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactName">Contact Name *</Label>
          <Input
            id="contactName"
            placeholder="Your name"
            {...register("contactName")}
            aria-invalid={errors.contactName ? "true" : undefined}
          />
          {errors.contactName && (
            <p className="text-destructive text-sm">
              {errors.contactName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPhone">Contact Phone *</Label>
          <Input
            id="contactPhone"
            placeholder="(555) 123-4567"
            type="tel"
            {...register("contactPhone")}
            aria-invalid={errors.contactPhone ? "true" : undefined}
          />
          {errors.contactPhone && (
            <p className="text-destructive text-sm">
              {errors.contactPhone.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactEmail">Contact Email *</Label>
        <Input
          id="contactEmail"
          placeholder="you@example.com"
          type="email"
          {...register("contactEmail")}
          aria-invalid={errors.contactEmail ? "true" : undefined}
        />
        {errors.contactEmail && (
          <p className="text-destructive text-sm">
            {errors.contactEmail.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="projectAddress">Project Address *</Label>
        <Input
          id="projectAddress"
          placeholder="Full project address"
          {...register("projectAddress")}
          aria-invalid={errors.projectAddress ? "true" : undefined}
        />
        {errors.projectAddress && (
          <p className="text-destructive text-sm">
            {errors.projectAddress.message}
          </p>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium text-sm">Services Requested</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {SERVICE_OPTIONS.map((service) => (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm"
              key={service}
            >
              <Checkbox
                checked={servicesRequested.includes(service)}
                onCheckedChange={() => toggleService(service)}
              />
              {service}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="constructionPlans">Construction Plans (optional)</Label>
        <Input
          accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf"
          className="cursor-pointer"
          id="constructionPlans"
          multiple
          ref={fileInputRef}
          type="file"
        />
        <p className="text-muted-foreground text-xs">
          Maximum 20MB total. Accepted: PDF, JPG, PNG, DWG, DXF
        </p>
      </div>

      {status === "error" && (
        <p className="text-destructive text-sm">
          Something went wrong. Please try again or call us directly.
        </p>
      )}

      <Button disabled={isPending} size="lg" type="submit">
        {isPending ? "Submitting..." : "Submit Request"}
      </Button>
    </form>
  );
}
