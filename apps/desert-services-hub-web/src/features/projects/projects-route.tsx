import { useLoaderData } from "react-router";

import type { ProjectWorkspace } from "@/features/projects/project-model";
import { projectWorkspaceSampleData } from "@/features/projects/project-sample-data";
import { ProjectsWorkspace } from "@/features/projects/projects-workspace";

interface ProjectsLoaderData {
  workspace: ProjectWorkspace;
}

export const projectsLoader = (): ProjectsLoaderData => ({
  workspace: projectWorkspaceSampleData,
});

export const ProjectsRoute = () => {
  const { workspace } = useLoaderData<ProjectsLoaderData>();

  return <ProjectsWorkspace projects={workspace.projects} />;
};
