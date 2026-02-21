import {
  Building2,
  FileCheck,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MapPin,
  Monitor,
  Package,
  Rocket,
  Search,
  Settings,
  Shield,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import useSWR from "swr";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/apps/web/frontend/components/ui/sidebar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/apps/web/frontend/components/ui/sidebar-menu";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface AutomationSidebarStatus {
  active: boolean;
  busy: boolean;
  currentOperation: string | null;
  portalReady: boolean;
}

// Workflow order: Estimates → Contracts → Project Initiation → Dust Permits
const mainNavItems = [
  { title: "Estimates", href: "/estimates", icon: FileText },
  { title: "Contracts", href: "/contracts", icon: FileCheck },
  { title: "Projects", href: "/projects", icon: Rocket },
  { title: "Dust Permits", href: "/permits", icon: Shield },
];

const manageItems = [
  { title: "Inbox", href: "/inbox", icon: Inbox },
  { title: "Emails", href: "/emails", icon: Mail },
  { title: "Processing", href: "/processing", icon: Loader2 },
  { title: "Catalog", href: "/catalog", icon: Package },
  { title: "Map", href: "/map", icon: MapPin },
  { title: "Maricopa Portal", href: "/maricopa", icon: Monitor },
  { title: "BuildingConnected", href: "/buildingconnected", icon: Building2 },
];

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
  const { data: automationStatus } = useSWR<AutomationSidebarStatus>(
    "/api/automation/status",
    fetcher,
    {
      refreshInterval: 15_000,
      dedupingInterval: 5000,
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    }
  );

  let portalLabel = "Portal Offline";
  let portalDotClass = "bg-red-500";
  if (automationStatus?.portalReady) {
    portalLabel = "Portal Ready";
    portalDotClass = "bg-green-500";
  } else if (automationStatus?.active) {
    portalLabel = "Portal Login Needed";
    portalDotClass = "bg-amber-500";
  }
  const portalTooltip = automationStatus?.busy
    ? `Portal busy: ${automationStatus.currentOperation || "running"}`
    : portalLabel;

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
            <SidebarMenuButton size="sm" tooltip={portalTooltip}>
              <div className={`size-2 rounded-full ${portalDotClass}`} />
              <span className="text-sidebar-foreground/60 text-xs">
                {portalLabel}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
