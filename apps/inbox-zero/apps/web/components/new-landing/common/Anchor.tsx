import Link from "next/link";
import { cn } from "@/utils";

interface AnchorProps {
  children: React.ReactNode;
  className?: string;
  href: string;
  newTab?: boolean;
}

export function Anchor({ href, newTab, className, children }: AnchorProps) {
  return (
    <Link
      className={cn("underline", className)}
      href={href}
      target={newTab ? "_blank" : undefined}
    >
      {children}
    </Link>
  );
}
