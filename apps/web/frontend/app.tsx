/**
 * Root App component with React Router
 */
import React, { Suspense } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
  Navigate,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouteError,
} from "react-router";
import { Toaster } from "sonner";

// Global styles - must be imported via JS for Bun's Tailwind plugin to process
import "@/apps/web/frontend/index.css";

// Layout components
import { AppSidebar } from "@/apps/web/frontend/components/app-sidebar";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
} from "@/apps/web/frontend/components/ui/sidebar";
import { AutomationPage } from "@/apps/web/frontend/pages/automation";
import { CatalogPage } from "@/apps/web/frontend/pages/catalog";
import { ContractsPage } from "@/apps/web/frontend/pages/contracts";
// Pages
import { DashboardPage } from "@/apps/web/frontend/pages/dashboard";
import { DocumentsPage } from "@/apps/web/frontend/pages/documents";
import { EmailsPage } from "@/apps/web/frontend/pages/emails";
import { EstimateEditorPage } from "@/apps/web/frontend/pages/estimate-editor";
import { EstimatesPage } from "@/apps/web/frontend/pages/estimates";
import { SenderReviewPage } from "@/apps/web/frontend/pages/sender-review";
import { SettingsPage } from "@/apps/web/frontend/pages/settings";
import { TakeoffEditorPage } from "@/apps/web/frontend/pages/takeoff-editor";
import { TakeoffsPage } from "@/apps/web/frontend/pages/takeoffs";

// Lazy-load map page (maplibre-gl is huge, don't block main bundle)
const LazyMapPage = React.lazy(() =>
  import("@/apps/web/frontend/pages/map").then((m) => ({
    default: m.MapPage,
  }))
);
const _routeLoadingFallback = (
  <div className="flex flex-1 items-center justify-center text-muted-foreground">
    Loading...
  </div>
);

// Error boundary component for routes
function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message =
      error.data?.message || "The requested resource could not be loaded.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="text-center">
        <h1 className="font-bold text-2xl text-foreground">{title}</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => navigate(-1)} variant="outline">
          Go Back
        </Button>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    </div>
  );
}

// Root layout with sidebar
function RootLayout() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="texture-noise relative overflow-auto bg-desert-gradient">
        <div className="flex h-full flex-col">
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster richColors />
    </SidebarProvider>
  );
}

// Router configuration — all data fetching via SWR inside components
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "estimates",
        element: <EstimatesPage />,
      },
      {
        path: "estimates/:id",
        element: <EstimateEditorPage />,
      },
      {
        path: "takeoffs",
        element: <TakeoffsPage />,
      },
      {
        path: "takeoffs/:id",
        element: <TakeoffEditorPage />,
      },
      {
        path: "contracts",
        element: <ContractsPage />,
      },
      {
        path: "emails",
        element: <EmailsPage />,
      },
      {
        path: "documents",
        element: <DocumentsPage />,
      },
      {
        path: "senders",
        element: <SenderReviewPage />,
      },
      {
        path: "docs",
        element: <Navigate replace to="/documents" />,
      },
      {
        path: "catalog",
        element: <CatalogPage />,
      },
      {
        path: "maricopa",
        element: <AutomationPage />,
      },
      {
        path: "automation",
        element: <AutomationPage />,
      },
      {
        path: "buildingconnected",
        element: <AutomationPage />,
      },
      {
        path: "map",
        element: (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                Loading map...
              </div>
            }
          >
            <LazyMapPage />
          </Suspense>
        ),
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
