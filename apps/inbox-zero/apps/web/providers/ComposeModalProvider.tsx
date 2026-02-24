"use client";

import { createContext, useContext } from "react";
import { ComposeEmailFormLazy } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModal } from "@/hooks/useModal";

type Context = {
  onOpen: () => void;
};

const ComposeModalContext = createContext<Context>({
  onOpen: async () => {},
});

export const useComposeModal = () => useContext(ComposeModalContext);

export function ComposeModalProvider(props: { children: React.ReactNode }) {
  const { isModalOpen, openModal, closeModal } = useModal();

  return (
    <ComposeModalContext.Provider value={{ onOpen: openModal }}>
      {props.children}
      <Dialog onOpenChange={closeModal} open={isModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <ComposeEmailFormLazy onSuccess={closeModal} />
        </DialogContent>
      </Dialog>
    </ComposeModalContext.Provider>
  );
}
