"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ContactFormValues, contactFormSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function ContactForm({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  function onSubmit(data: ContactFormValues) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/forms/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
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
          We&apos;ve received your message and will get back to you as soon as
          possible.
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            placeholder="First name"
            {...register("firstName")}
            aria-invalid={errors.firstName ? "true" : undefined}
          />
          {errors.firstName && (
            <p className="text-destructive text-sm">
              {errors.firstName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            placeholder="Last name"
            {...register("lastName")}
            aria-invalid={errors.lastName ? "true" : undefined}
          />
          {errors.lastName && (
            <p className="text-destructive text-sm">
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            placeholder="(555) 123-4567"
            type="tel"
            {...register("phone")}
            aria-invalid={errors.phone ? "true" : undefined}
          />
          {errors.phone && (
            <p className="text-destructive text-sm">{errors.phone.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            placeholder="you@example.com"
            type="email"
            {...register("email")}
            aria-invalid={errors.email ? "true" : undefined}
          />
          {errors.email && (
            <p className="text-destructive text-sm">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Message *</Label>
        <Textarea
          id="message"
          placeholder="How can we help?"
          rows={5}
          {...register("message")}
          aria-invalid={errors.message ? "true" : undefined}
        />
        {errors.message && (
          <p className="text-destructive text-sm">{errors.message.message}</p>
        )}
      </div>

      {status === "error" && (
        <p className="text-destructive text-sm">
          Something went wrong. Please try again or call us directly.
        </p>
      )}

      <Button disabled={isPending} size="lg" type="submit">
        {isPending ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}
