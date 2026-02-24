"use client";

import {
  BuildingIcon,
  HeadphonesIcon,
  HomeIcon,
  RocketIcon,
  ShoppingCartIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/utils";

const navigation = [{ name: "Enterprise", href: "/enterprise" }];

const useCases = [
  {
    title: "Founders",
    href: "/founders",
    description: "Scale your startup while AI handles your inbox",
    icon: RocketIcon,
    iconColor: "text-new-purple-600",
    borderColor: "from-new-purple-200 to-new-purple-300",
    gradient: "from-new-purple-50 to-new-purple-100",
    hoverBg: "hover:bg-new-purple-50/[0.44]",
  },
  {
    title: "Small Business",
    href: "/small-business",
    description: "Grow your business with automated email management",
    icon: BuildingIcon,
    iconColor: "text-new-green-500",
    borderColor: "from-new-green-150 to-new-green-200",
    gradient: "from-new-green-50 to-new-green-100",
    hoverBg: "hover:bg-new-green-50",
  },
  {
    title: "Content Creators",
    href: "/creator",
    description: "Streamline brand partnerships and collaborations",
    icon: UserIcon,
    iconColor: "text-new-blue-600",
    borderColor: "from-new-blue-150 to-new-blue-200",
    gradient: "from-new-blue-50 to-new-blue-100",
    hoverBg: "hover:bg-new-blue-50/50",
  },
  {
    title: "Real Estate",
    href: "/real-estate",
    description: "AI email management for real estate professionals",
    icon: HomeIcon,
    iconColor: "text-new-pink-500",
    borderColor: "from-new-pink-150 to-new-pink-200",
    gradient: "from-new-pink-50 to-new-pink-100",
    hoverBg: "hover:bg-new-pink-50/[0.44]",
  },
  {
    title: "Customer Support",
    href: "/support",
    description: "Deliver faster support with AI-powered responses",
    icon: HeadphonesIcon,
    iconColor: "text-new-orange-600",
    borderColor: "from-new-orange-150 to-new-orange-200",
    gradient: "from-new-orange-50 to-new-orange-100",
    hoverBg: "hover:bg-new-orange-50/50",
  },
  {
    title: "E-commerce",
    href: "/ecommerce",
    description: "Automate order updates and customer communications",
    icon: ShoppingCartIcon,
    iconColor: "text-new-indigo-600",
    borderColor: "from-new-indigo-150 to-new-indigo-200",
    gradient: "from-new-indigo-50 to-new-indigo-100",
    hoverBg: "hover:bg-new-indigo-50/50",
  },
];

export function HeaderLinks() {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-x-8">
      <NavigationMenu>
        <NavigationMenuList>
          {/* Solutions Dropdown */}
          <NavigationMenuItem>
            <NavigationMenuTrigger className="font-geist font-semibold text-gray-900 text-sm leading-6">
              Solutions
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[640px] grid-cols-2 gap-2 p-4">
                {useCases.map((useCase) => (
                  <EnhancedListItem
                    borderColor={useCase.borderColor}
                    gradient={useCase.gradient}
                    hoverBg={useCase.hoverBg}
                    href={useCase.href}
                    icon={useCase.icon}
                    iconColor={useCase.iconColor}
                    key={useCase.title}
                    title={useCase.title}
                  >
                    {useCase.description}
                  </EnhancedListItem>
                ))}
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>

          {/* Regular Navigation Items */}
          {navigation.map((item) => (
            <NavigationMenuItem key={item.name}>
              <NavigationMenuLink
                asChild
                className={navigationMenuTriggerStyle()}
              >
                <Link
                  className="font-geist font-semibold text-gray-900 text-sm leading-6"
                  href={item.href}
                >
                  {item.name}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}

function EnhancedListItem({
  title,
  children,
  href,
  icon: Icon,
  iconColor,
  gradient,
  borderColor,
  hoverBg,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & {
  href: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  gradient: string;
  borderColor: string;
  hoverBg: string;
}) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link
          className={cn(
            "group block select-none space-y-1 rounded-xl p-4 leading-none no-underline outline-none transition-all duration-200 focus:bg-accent focus:text-accent-foreground",
            hoverBg
          )}
          href={href}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "rounded-lg bg-gradient-to-b p-px shadow-sm",
                borderColor
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-b shadow-sm transition-transform",
                  gradient
                )}
              >
                <Icon className={cn("h-4 w-4", iconColor)} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 text-sm leading-none group-hover:text-gray-800">
                {title}
              </div>
              <p className="mt-1 text-gray-600 text-sm leading-snug group-hover:text-gray-700">
                {children}
              </p>
            </div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
