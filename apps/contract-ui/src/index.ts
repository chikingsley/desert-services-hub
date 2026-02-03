import { serve } from "bun";
import {
  createProjectTask,
  getActiveProjects,
  getAllProjects,
  getProjectDetails,
  getProjectsByStatus,
  getStats,
  updateProjectStatus,
  updateProjectTask,
  updateProjectTracking,
} from "./db/queries";
import index from "./index.html";

const server = serve({
  routes: {
    // Projects API
    "/api/projects": {
      GET(req) {
        try {
          const url = new URL(req.url);
          const status = url.searchParams.get("status") || "active";

          function getProjects(s: string) {
            if (s === "all") {
              return getAllProjects();
            }
            if (s === "active") {
              return getActiveProjects();
            }
            return getProjectsByStatus(s);
          }

          const projects = getProjects(status);
          return Response.json(projects);
        } catch (err) {
          console.error("Failed to get projects:", err);
          return Response.json(
            { error: "Failed to fetch projects" },
            { status: 500 }
          );
        }
      },
    },

    "/api/projects/stats": {
      GET() {
        try {
          const stats = getStats();
          return Response.json(stats);
        } catch (err) {
          console.error("Failed to get stats:", err);
          return Response.json(
            { error: "Failed to fetch stats" },
            { status: 500 }
          );
        }
      },
    },

    "/api/projects/:id": {
      GET(req) {
        try {
          const id = Number(req.params.id);
          const details = getProjectDetails(id);
          if (!details) {
            return Response.json(
              { error: "Project not found" },
              { status: 404 }
            );
          }
          return Response.json(details);
        } catch (err) {
          console.error("Failed to get project:", err);
          return Response.json(
            { error: "Failed to fetch project" },
            { status: 500 }
          );
        }
      },

      async PATCH(req) {
        try {
          const id = Number(req.params.id);
          const updates = await req.json();
          if (updates.status) {
            updateProjectStatus(id, updates.status);
          }
          const details = getProjectDetails(id);
          return Response.json(details);
        } catch (err) {
          console.error("Failed to update project:", err);
          return Response.json(
            { error: "Failed to update project" },
            { status: 500 }
          );
        }
      },
    },

    "/api/projects/:id/tracking": {
      async PATCH(req) {
        try {
          const id = Number(req.params.id);
          const updates = await req.json();
          const tracking = updateProjectTracking(id, updates);
          if (!tracking) {
            return Response.json(
              { error: "Project not found" },
              { status: 404 }
            );
          }
          return Response.json(tracking);
        } catch (err) {
          console.error("Failed to update tracking:", err);
          return Response.json(
            { error: "Failed to update tracking" },
            { status: 500 }
          );
        }
      },
    },

    "/api/projects/:id/tasks": {
      async POST(req) {
        try {
          const id = Number(req.params.id);
          const body = await req.json();
          const description =
            typeof body.description === "string" ? body.description.trim() : "";
          if (!description) {
            return Response.json(
              { error: "Task description required" },
              { status: 400 }
            );
          }
          const task = createProjectTask(id, description);
          if (!task) {
            return Response.json(
              { error: "Project not found" },
              { status: 404 }
            );
          }
          return Response.json(task, { status: 201 });
        } catch (err) {
          console.error("Failed to create task:", err);
          return Response.json(
            { error: "Failed to create task" },
            { status: 500 }
          );
        }
      },
    },

    "/api/tasks/:id": {
      async PATCH(req) {
        try {
          const id = Number(req.params.id);
          const updates = await req.json();
          const task = updateProjectTask(id, updates);
          if (!task) {
            return Response.json({ error: "Task not found" }, { status: 404 });
          }
          return Response.json(task);
        } catch (err) {
          console.error("Failed to update task:", err);
          return Response.json(
            { error: "Failed to update task" },
            { status: 500 }
          );
        }
      },
    },

    // Serve index.html for all unmatched routes (SPA)
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
