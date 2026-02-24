"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon | ((props: any) => React.ReactNode);
  target?: "_blank";
  count?: number;
  hideInMail?: boolean;
  active?: boolean;
  beta?: boolean;
  new?: boolean;
};

export function SideNavMenu({
  items,
  activeHref,
}: {
  items: NavItem[];
  activeHref: string;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem className="font-semibold" key={item.name}>
          <SidebarMenuButton
            asChild
            className="h-9"
            isActive={item.active || activeHref === item.href}
            sidebarName="left-sidebar"
            tooltip={item.name}
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.name}</span>
              {item.new && (
                <Badge className="ml-auto text-[10px]" variant="green">
                  New!
                </Badge>
              )}
              {item.beta && (
                <Badge className="ml-auto text-[10px]" variant="secondary">
                  Beta
                </Badge>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
