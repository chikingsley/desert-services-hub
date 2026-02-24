"use client";

import { Provider } from "jotai";
import type React from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatProvider } from "@/providers/ChatProvider";
import { ComposeModalProvider } from "@/providers/ComposeModalProvider";
import { jotaiStore } from "@/store";

export function AppProviders(props: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <Provider store={jotaiStore}>
        <ChatProvider>
          <ComposeModalProvider>{props.children}</ComposeModalProvider>
        </ChatProvider>
      </Provider>
    </ThemeProvider>
  );
}
