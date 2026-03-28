import { createBrowserRouter, Navigate } from "react-router";

import { RootLayout } from "@/app/root-layout";
import { RouteErrorBoundary } from "@/app/route-error-boundary";

export const router = createBrowserRouter([
  {
    children: [
      {
        element: <Navigate replace to="/projects" />,
        index: true,
      },
      {
        lazy: async () => {
          const route = await import("@/features/projects/projects-route");

          return {
            Component: route.ProjectsRoute,
            loader: route.projectsLoader,
          };
        },
        path: "projects",
      },
      {
        lazy: async () => {
          const route = await import("@/features/estimates/estimates-route");

          return {
            Component: route.EstimatesRoute,
          };
        },
        path: "estimates",
      },
      {
        lazy: async () => {
          const route = await import("@/features/documents/documents-route");

          return {
            Component: route.DocumentsRoute,
            loader: route.documentsLoader,
          };
        },
        path: "documents",
      },
      {
        lazy: async () => {
          const route = await import("@/features/emails/emails-route");

          return {
            Component: route.EmailsRoute,
          };
        },
        path: "emails",
      },
      {
        lazy: async () => {
          const route =
            await import("@/features/dust-permits/dust-permits-route");

          return {
            Component: route.DustPermitsRoute,
          };
        },
        path: "dust-permits",
      },
      {
        element: <Navigate replace to="/projects" />,
        path: "contracts",
      },
      {
        lazy: async () => {
          const route = await import("@/features/not-found/not-found-route");

          return {
            Component: route.NotFoundRoute,
          };
        },
        path: "*",
      },
    ],
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    path: "/",
  },
]);
