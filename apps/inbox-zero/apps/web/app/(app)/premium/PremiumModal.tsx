import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function usePremiumModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);

  const PremiumModal = useCallback(() => {
    return (
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="max-w-lg bg-white">
          <div className="space-y-4">
            <h2 className="font-title text-2xl text-gray-900">
              Billing Disabled
            </h2>
            <p className="text-gray-600 text-sm">
              Billing and plan upgrades are disabled in this internal fork. AI
              features are controlled directly by internal configuration.
            </p>
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }, [isOpen]);

  return {
    openModal,
    PremiumModal,
  };
}
