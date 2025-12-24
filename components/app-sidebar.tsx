"use client";

import {
  FileCheck,
  FileText,
  Rocket,
  Ruler,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

// Workflow order: Takeoffs → Quotes → Contracts → Project Initiation
const mainNavItems = [
  { title: "Takeoffs", href: "/takeoffs", icon: Ruler },
  { title: "Quotes", href: "/quotes", icon: FileText },
  { title: "Contracts", href: "/contracts", icon: FileCheck, disabled: true },
  {
    title: "Project Initiation",
    href: "/projects",
    icon: Rocket,
    disabled: true,
  },
];

const utilityItems = [
  { title: "Search", href: "/search", icon: Search, disabled: true },
  { title: "Settings", href: "/settings", icon: Settings, disabled: true },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-12" size="lg">
              <Link href="/">
                <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Sun className="size-5" />
                </div>
                <div className="grid flex-1 gap-1 text-left">
                  <span className="truncate font-semibold text-base leading-none">
                    Desert Services
                  </span>
                  <span className="truncate text-muted-foreground text-sm leading-none">
                    Hub
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Main Navigation - Workflow Order */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {mainNavItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  disabled={item.disabled}
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.title}
                >
                  <Link href={item.disabled ? "#" : item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.disabled && (
                      <span className="ml-auto text-muted-foreground text-xs">
                        Soon
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Utility Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarMenu>
            {utilityItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  disabled={item.disabled}
                  isActive={pathname === item.href}
                  tooltip={item.title}
                >
                  <Link href={item.disabled ? "#" : item.href}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t px-2 py-1">
        <span className="text-[10px] text-muted-foreground">v0.1</span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
