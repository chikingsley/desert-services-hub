import {
  FileCheck,
  FileText,
  Package,
  Rocket,
  Search,
  Settings,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

// Workflow order: Quotes → Contracts → Project Initiation
const mainNavItems = [
  { title: "Quotes", href: "/quotes", icon: FileText },
  { title: "Contracts", href: "/contracts", icon: FileCheck, disabled: true },
  {
    title: "Project Initiation",
    href: "/projects",
    icon: Rocket,
    disabled: true,
  },
];

const manageItems = [{ title: "Catalog", href: "/catalog", icon: Package }];

const utilityItems = [
  { title: "Search", href: "/search", icon: Search, disabled: true },
  { title: "Settings", href: "/settings", icon: Settings },
];

// Desert sun logo component
function DesertSunLogo() {
  return (
    <svg
      aria-labelledby="desert-sun-logo-title"
      className="size-8"
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
}

export function AppSidebar() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Desert Services Hub">
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary">
                  <DesertSunLogo />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    Desert Services
                  </span>
                  <span className="truncate text-sidebar-foreground/60 text-xs">
                    Estimation Hub
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation - Workflow Order */}
        <SidebarGroup>
          <SidebarGroupLabel>Workflow</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      disabled={item.disabled}
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link to={item.disabled ? "#" : item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Manage Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manageItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link to={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Utility Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {utilityItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    disabled={item.disabled}
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link to={item.disabled ? "#" : item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" tooltip="v0.1 • Active">
              <div className="size-2 rounded-full bg-green-500" />
              <span className="text-sidebar-foreground/60 text-xs">
                v0.1 • Active
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
