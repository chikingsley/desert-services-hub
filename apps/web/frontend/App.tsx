/**
 * Root App component with React Router (Data Mode)
 */
import React, { Suspense } from "react";
import {
  createBrowserRouter,
  isRouteErrorResponse,
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
import { CatalogPage, catalogLoader } from "@/apps/web/frontend/pages/catalog";
import {
  ContractsPage,
  contractsLoader,
} from "@/apps/web/frontend/pages/contracts";
// Pages
import { DashboardPage } from "@/apps/web/frontend/pages/dashboard";
import {
  EstimateEditorPage,
  estimateLoader,
} from "@/apps/web/frontend/pages/estimate-editor";
import {
  EstimatesPage,
  estimatesLoader,
} from "@/apps/web/frontend/pages/estimates";
import { SettingsPage } from "@/apps/web/frontend/pages/settings";
import {
  TakeoffEditorPage,
  takeoffLoader,
} from "@/apps/web/frontend/pages/takeoff-editor";
import {
  TakeoffsPage,
  takeoffsLoader,
} from "@/apps/web/frontend/pages/takeoffs";

// Lazy-load map page (maplibre-gl is huge, don't block main bundle)
const LazyMapPage = React.lazy(
  () => import("@/apps/web/frontend/pages/map").then((m) => ({ default: m.MapPage })),
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
      <SidebarInset className="texture-noise overflow-auto bg-desert-gradient">
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
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "estimates",
        element: <EstimatesPage />,
        loader: estimatesLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "estimates/:id",
        element: <EstimateEditorPage />,
        loader: estimateLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "takeoffs",
        element: <TakeoffsPage />,
        loader: takeoffsLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "takeoffs/:id",
        element: <TakeoffEditorPage />,
        loader: takeoffLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "contracts",
        element: <ContractsPage />,
        loader: contractsLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "catalog",
        element: <CatalogPage />,
        loader: catalogLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "map",
        element: (
          <Suspense fallback={<div className="flex flex-1 items-center justify-center text-muted-foreground">Loading map...</div>}>
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
