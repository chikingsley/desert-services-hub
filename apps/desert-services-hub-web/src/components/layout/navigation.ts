import {
  ClipboardListIcon,
  FileStackIcon,
  FolderKanbanIcon,
  InboxIcon,
  MapPinnedIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface WorkspaceNavigationItem {
  description: string;
  icon: LucideIcon;
  title: string;
  to: string;
}

export const workspaceNavigationItems: readonly WorkspaceNavigationItem[] = [
  {
    description:
      "Project-level workspace spanning contracts, documents, permits, and linked email context.",
    icon: FolderKanbanIcon,
    title: "Projects",
    to: "/projects",
  },
  {
    description: "Pricing, bid tracking, and estimate lifecycle views.",
    icon: ClipboardListIcon,
    title: "Estimates",
    to: "/estimates",
  },
  {
    description: "Document extraction review, previews, reruns, and QA.",
    icon: FileStackIcon,
    title: "Documents",
    to: "/documents",
  },
  {
    description: "Operational inbox, linking, and project-related email work.",
    icon: InboxIcon,
    title: "Emails",
    to: "/emails",
  },
  {
    description:
      "Dust permit lookup, renewal, status, and related project work.",
    icon: MapPinnedIcon,
    title: "Dust Permits",
    to: "/dust-permits",
  },
] as const;

export const isNavigationItemActive = (
  pathname: string,
  itemPath: string
): boolean => pathname === itemPath || pathname.startsWith(`${itemPath}/`);

export const getNavigationItemForPath = (
  pathname: string
): WorkspaceNavigationItem | null =>
  workspaceNavigationItems.find((item) =>
    isNavigationItemActive(pathname, item.to)
  ) ?? null;
