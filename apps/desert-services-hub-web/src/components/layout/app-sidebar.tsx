import { Link, useLocation } from "react-router";

import {
  isNavigationItemActive,
  workspaceNavigationItems,
} from "@/components/layout/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const DesertSunLogo = () => (
  <svg
    aria-labelledby="desert-sun-logo-title"
    className="size-5"
    fill="none"
    viewBox="0 0 40 40"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title id="desert-sun-logo-title">Desert Services Hub Logo</title>
    <circle cx="20" cy="20" fill="#FFF8E7" r="10" />
    <g stroke="#FFF8E7" strokeLinecap="round" strokeWidth="2.5">
      <line x1="20" x2="20" y1="4" y2="8" />
      <line x1="20" x2="20" y1="32" y2="36" />
      <line x1="4" x2="8" y1="20" y2="20" />
      <line x1="32" x2="36" y1="20" y2="20" />
      <line x1="8.69" x2="11.52" y1="8.69" y2="11.52" />
      <line x1="28.48" x2="31.31" y1="28.48" y2="31.31" />
      <line x1="8.69" x2="11.52" y1="31.31" y2="28.48" />
      <line x1="28.48" x2="31.31" y1="11.52" y2="8.69" />
    </g>
    <circle cx="20" cy="20" fill="#FFE4B5" opacity="0.6" r="5" />
  </svg>
);

export const AppSidebar = () => {
  const { pathname } = useLocation();
  const { isMobile, state } = useSidebar();
  const showBrandText = isMobile || state !== "collapsed";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-12"
              isActive={isNavigationItemActive(pathname, "/projects")}
              render={<Link to="/projects" />}
              size="lg"
              tooltip="Desert Services Hub"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <DesertSunLogo />
              </div>
              {showBrandText && (
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    Desert Services Hub
                  </span>
                </div>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNavigationItems.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isNavigationItemActive(pathname, item.to)}
                      render={<Link to={item.to} />}
                      tooltip={item.title}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
};
