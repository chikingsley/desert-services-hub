"use client";

import { ChevronDown, Menu, Phone, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NavItem } from "@/data/navigation";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  navigation: NavItem[];
  phone: string;
}

export function SiteHeader({ navigation, phone }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <Container className="flex h-16 items-center justify-between md:h-20">
        <Link className="shrink-0" href="/">
          <Image
            alt="Desert Services"
            className="h-10 w-auto md:h-12"
            height={50}
            priority
            src="/images/logos/horizontal-color-logo.png"
            width={200}
          />
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {navigation
            .filter((item) => !item.href.startsWith("tel:"))
            .map((item) => (
              <DesktopNavItem item={item} key={item.label} />
            ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild className="hidden sm:flex" size="sm" variant="ghost">
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
              <Phone className="mr-1.5 size-4" />
              {phone}
            </a>
          </Button>

          {/* Mobile menu */}
          <MobileMenu navigation={navigation} phone={phone} />
        </div>
      </Container>
    </header>
  );
}

function DesktopNavItem({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);

  if (!item.children?.length) {
    return (
      <Link
        className="rounded-md px-3 py-2 font-medium text-foreground/80 text-sm transition-colors hover:bg-accent hover:text-foreground"
        href={item.href}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        className="inline-flex items-center rounded-md px-3 py-2 font-medium text-foreground/80 text-sm transition-colors hover:bg-accent hover:text-foreground"
        href={item.href}
        onFocus={() => setOpen(true)}
      >
        {item.label}
        <ChevronDown
          className={cn(
            "ml-1 size-3.5 transition-transform",
            open && "rotate-180"
          )}
        />
      </Link>

      {open && (
        <div
          className="absolute top-full left-0 z-50 min-w-[220px] rounded-md border bg-white py-1 shadow-lg"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setOpen(false);
            }
          }}
        >
          {item.children.map((child) => (
            <Link
              className="block px-4 py-2 text-foreground/80 text-sm hover:bg-accent hover:text-foreground"
              href={child.href}
              key={child.label}
              onClick={() => setOpen(false)}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenu({
  navigation,
  phone,
}: {
  navigation: NavItem[];
  phone: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button className="lg:hidden" size="icon" variant="ghost">
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 overflow-y-auto" side="right">
        <div className="flex items-center justify-between pb-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Image
            alt="Desert Services"
            className="h-8 w-auto"
            height={38}
            src="/images/logos/horizontal-color-logo.png"
            width={150}
          />
          <SheetClose asChild>
            <Button size="icon" variant="ghost">
              <X className="size-5" />
              <span className="sr-only">Close menu</span>
            </Button>
          </SheetClose>
        </div>

        <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
          {navigation
            .filter((item) => !item.href.startsWith("tel:"))
            .map((item) => (
              <MobileNavItem
                item={item}
                key={item.label}
                onClose={() => setOpen(false)}
              />
            ))}
        </nav>

        <div className="mt-6 border-t pt-4">
          <Button asChild className="w-full">
            <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
              <Phone className="mr-2 size-4" />
              Call {phone}
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavItem({
  item,
  onClose,
}: {
  item: NavItem;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!item.children?.length) {
    return (
      <Link
        className="rounded-md px-3 py-2 font-medium text-sm hover:bg-accent"
        href={item.href}
        onClick={onClose}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div>
      <div className="flex items-center">
        <Link
          className="flex-1 rounded-md px-3 py-2 font-medium text-sm hover:bg-accent"
          href={item.href}
          onClick={onClose}
        >
          {item.label}
        </Link>
        <Button
          aria-expanded={expanded}
          className="size-8"
          onClick={() => setExpanded(!expanded)}
          size="icon"
          variant="ghost"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </Button>
      </div>
      {expanded && (
        <div className="ml-4 flex flex-col gap-1">
          {item.children.map((child) => (
            <Link
              className="rounded-md px-3 py-2 text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
              href={child.href}
              key={child.label}
              onClick={onClose}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
