"use client";

import { motion } from "framer-motion";
import { ArrowRightIcon, MailIcon } from "lucide-react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex items-center justify-center">
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            initial={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <IconCircle size="lg">
              <MailIcon className="size-6" />
            </IconCircle>
          </motion.div>
        </div>

        <PageHeading className="mb-3">Welcome to Inbox Zero</PageHeading>

        <TypographyP className="mb-8 text-muted-foreground">
          Here's a quick look at what Inbox Zero can do for you.
        </TypographyP>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
