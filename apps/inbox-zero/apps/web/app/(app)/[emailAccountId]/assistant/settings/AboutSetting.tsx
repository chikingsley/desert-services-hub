"use client";

import { useState } from "react";
import { AboutSection } from "@/app/(app)/[emailAccountId]/settings/AboutSectionForm";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AboutSetting() {
  const [open, setOpen] = useState(false);

  return (
    <SettingCard
      description="Tell the AI about yourself and how you'd like it to handle your emails."
      right={
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Personal instructions</DialogTitle>
              <DialogDescription>
                Tell the AI about yourself and how you'd like it to handle your
                emails.
              </DialogDescription>
            </DialogHeader>

            <AboutSection onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      }
      title="Personal instructions"
    />
  );
}
