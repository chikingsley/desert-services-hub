import { useCallback, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function usePremiumModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);

  const PremiumModal = useCallback(() => {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg bg-white">
          <div className="space-y-4">
            <h2 className="font-title text-2xl text-gray-900">
              Billing Disabled
            </h2>
            <p className="text-sm text-gray-600">
              Billing and plan upgrades are disabled in this internal fork.
              AI features are controlled directly by internal configuration.
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
