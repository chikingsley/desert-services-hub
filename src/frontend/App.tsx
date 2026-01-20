/**
 * Root App component with React Router (Data Mode)
 */
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { Toaster } from "sonner";

// Global styles - must be imported via JS for Bun's Tailwind plugin to process
import "./index.css";

// Layout components
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CatalogPage } from "@/pages/catalog";
// Pages
import { DashboardPage } from "@/pages/dashboard";
import { QuoteEditorPage, quoteLoader } from "@/pages/quote-editor";
import { QuotesPage, quotesLoader } from "@/pages/quotes";
import { SettingsPage } from "@/pages/settings";
import { TakeoffEditorPage, takeoffLoader } from "@/pages/takeoff-editor";
import { TakeoffNewPage } from "@/pages/takeoff-new";
import { TakeoffsPage, takeoffsLoader } from "@/pages/takeoffs";

// Root layout with sidebar
function RootLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="texture-noise bg-desert-gradient">
        <Outlet />
      </SidebarInset>
      <Toaster richColors />
    </SidebarProvider>
  );
}

// Router configuration with data loaders
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "quotes",
        element: <QuotesPage />,
        loader: quotesLoader,
      },
      {
        path: "quotes/:id",
        element: <QuoteEditorPage />,
        loader: quoteLoader,
      },
      {
        path: "takeoffs",
        element: <TakeoffsPage />,
        loader: takeoffsLoader,
      },
      {
        path: "takeoffs/new",
        element: <TakeoffNewPage />,
      },
      {
        path: "takeoffs/:id",
        element: <TakeoffEditorPage />,
        loader: takeoffLoader,
      },
      {
        path: "catalog",
        element: <CatalogPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
