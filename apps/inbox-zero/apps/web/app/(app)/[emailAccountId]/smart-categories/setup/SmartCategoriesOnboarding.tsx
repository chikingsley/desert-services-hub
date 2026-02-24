"use client";

import { ArchiveIcon, TagsIcon, ZapIcon } from "lucide-react";
import { useOnboarding } from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import { CardBasic } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SmartCategoriesOnboarding() {
  const { isOpen, setIsOpen, onClose } = useOnboarding("SmartCategories");

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to Sender Categories</DialogTitle>
          <DialogDescription>
            Automatically categorize who emails you for better inbox management
            and smarter automation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:gap-4">
          <CardBasic className="flex items-center">
            <TagsIcon className="mr-3 h-5 w-5" />
            Auto-categorize who emails you
          </CardBasic>
          <CardBasic className="flex items-center">
            <ArchiveIcon className="mr-3 h-5 w-5" />
            Bulk archive by category
          </CardBasic>
          <CardBasic className="flex items-center">
            <ZapIcon className="mr-3 h-5 w-5" />
            Use categories to optimize the AI assistant
          </CardBasic>
        </div>
        <div>
          <Button className="w-full" onClick={onClose}>
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
