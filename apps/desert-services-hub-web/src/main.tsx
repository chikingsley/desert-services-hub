import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";

import "@/style.css";

const rootElement = document.querySelector("#app");

if (!rootElement) {
  throw new Error("App root element '#app' was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
