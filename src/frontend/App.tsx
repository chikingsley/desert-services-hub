/**
 * Root App component with React Router (Data Mode)
 */
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
import "./index.css";

// Layout components
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CatalogPage, catalogLoader } from "@/pages/catalog";
// Pages
import { DashboardPage } from "@/pages/dashboard";
import { QuoteEditorPage, quoteLoader } from "@/pages/quote-editor";
import { QuotesPage, quotesLoader } from "@/pages/quotes";
import { SettingsPage } from "@/pages/settings";
import { TakeoffEditorPage, takeoffLoader } from "@/pages/takeoff-editor";
import { TakeoffsPage, takeoffsLoader } from "@/pages/takeoffs";

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
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "quotes",
        element: <QuotesPage />,
        loader: quotesLoader,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: "quotes/:id",
        element: <QuoteEditorPage />,
        loader: quoteLoader,
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
        path: "catalog",
        element: <CatalogPage />,
        loader: catalogLoader,
        errorElement: <RouteErrorBoundary />,
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
