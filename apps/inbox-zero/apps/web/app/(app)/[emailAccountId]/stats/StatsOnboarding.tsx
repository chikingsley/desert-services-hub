"use client";

import { ArchiveIcon, BarChartBigIcon, Layers3Icon } from "lucide-react";
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

export function StatsOnboarding() {
  const { isOpen, setIsOpen, onClose } = useOnboarding("Stats");

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to email analytics</DialogTitle>
          <DialogDescription>
            Get insights from the depths of your email and clean it up it no
            time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:gap-4">
          <CardBasic className="flex items-center">
            <BarChartBigIcon className="mr-3 h-5 w-5" />
            Visualise your data
          </CardBasic>
          <CardBasic className="flex items-center">
            <Layers3Icon className="mr-3 h-5 w-5" />
            Understand what{`'`}s filling up your inbox
          </CardBasic>
          <CardBasic className="flex items-center">
            <ArchiveIcon className="mr-3 h-5 w-5" />
            Unsubscribe and bulk archive
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
