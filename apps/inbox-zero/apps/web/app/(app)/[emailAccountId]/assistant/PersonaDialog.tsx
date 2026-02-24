"use client";

import { ButtonList } from "@/components/ButtonList";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Personas } from "./examples";

export function PersonaDialog({
  isOpen,
  setIsOpen,
  onSelect,
  personas,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelect: (persona: string) => void;
  personas: Personas;
}) {
  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogContent>
        <DialogTitle className="font-medium text-lg">
          Choose a persona
        </DialogTitle>

        <ButtonList
          columns={3}
          emptyMessage=""
          items={Object.entries(personas).map(([id, persona]) => ({
            id,
            name: persona.label,
          }))}
          onSelect={(id) => {
            onSelect(id);
            setIsOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
