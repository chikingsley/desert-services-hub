import Link from "next/link";
import { footerNavigation } from "@/app/(landing)/home/Footer";
import { Logo } from "@/components/new-landing/common/Logo";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { FooterLineLogo } from "@/components/new-landing/FooterLineLogo";
import { UnicornScene } from "@/components/new-landing/UnicornScene";
import { env } from "@/env";
import { cn } from "@/utils";

interface FooterProps {
  className: string;
  variant?: "default" | "simple";
}

// Simple footer for self-hosted deployments
const selfHostedFooter = {
  resources: [
    {
      name: "Documentation",
      href: "https://docs.getinboxzero.com",
      target: "_blank",
    },
    { name: "GitHub", href: "/github", target: "_blank" },
    { name: "Discord", href: "/discord", target: "_blank" },
  ],
  legal: [
    { name: "Terms", href: "/terms" },
    { name: "Privacy", href: "/privacy" },
  ],
};

export function Footer({ className, variant = "default" }: FooterProps) {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return (
      <footer className="relative z-50 overflow-hidden border-[#E7E7E7A3] border-t bg-center bg-cover bg-no-repeat">
        <div className={cn("overflow-hidden px-6 py-12 lg:px-8", className)}>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {selfHostedFooter.resources.map((item) => (
              <Link
                className="text-gray-500 text-sm leading-6 hover:text-gray-900"
                href={item.href}
                key={item.name}
                rel={
                  item.target === "_blank" ? "noopener noreferrer" : undefined
                }
                target={item.target}
              >
                {item.name}
              </Link>
            ))}
            <span className="text-gray-300">|</span>
            {selfHostedFooter.legal.map((item) => (
              <Link
                className="text-gray-500 text-sm leading-6 hover:text-gray-900"
                href={item.href}
                key={item.name}
              >
                {item.name}
              </Link>
            ))}
          </div>
          <p className="mt-6 text-center text-gray-500 text-xs leading-5">
            Powered by{" "}
            <Link
              className="hover:text-gray-900"
              href="https://getinboxzero.com"
              rel="noopener noreferrer"
              target="_blank"
            >
              Inbox Zero
            </Link>
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative z-50 overflow-hidden border-[#E7E7E7A3] border-t bg-center bg-cover bg-no-repeat">
      {variant === "default" ? <UnicornScene className="opacity-15" /> : null}
      <div
        className={cn("overflow-hidden px-6 py-20 sm:py-24 lg:px-8", className)}
      >
        <div className="mt-16 grid grid-cols-2 gap-8 lg:grid-cols-5 xl:col-span-2 xl:mt-0">
          <div>
            <FooterList items={footerNavigation.main} title="Product" />
          </div>
          <div>
            <FooterList items={footerNavigation.useCases} title="Use Cases" />
          </div>
          <div>
            <FooterList items={footerNavigation.support} title="Support" />
            <div className="mt-6">
              <FooterList items={footerNavigation.tools} title="Free Tools" />
            </div>
          </div>
          <div>
            <FooterList items={footerNavigation.company} title="Company" />
          </div>
          <div>
            <FooterList items={footerNavigation.legal} title="Legal" />
            <div className="mt-6">
              <FooterList items={footerNavigation.compare} title="Compare" />
            </div>
          </div>
        </div>
        <div className="mt-40 flex items-center justify-between">
          <Logo variant="glass" />
          <div className="flex items-center gap-4">
            {footerNavigation.social.map((item) => (
              <Link
                className="text-gray-400 hover:text-gray-500"
                href={item.href}
                key={item.name}
              >
                <span className="sr-only">{item.name}</span>
                <item.icon aria-hidden="true" className="h-6 w-6" />
              </Link>
            ))}
          </div>
        </div>
      </div>
      {variant === "default" ? (
        <FooterLineLogo className="absolute bottom-0 left-1/2 -z-10 mx-auto hidden -translate-x-1/2 px-6 lg:px-8 xl:block" />
      ) : null}
    </footer>
  );
}

function FooterList(props: {
  title: string;
  items: { name: string; href: string; target?: string }[];
}) {
  return (
    <>
      <Paragraph
        as="h3"
        className="font-semibold leading-6"
        color="gray-900"
        size="sm"
      >
        {props.title}
      </Paragraph>
      <ul className="mt-6 space-y-3">
        {props.items.map((item) => (
          <li key={item.name}>
            <Link
              className="text-gray-500 text-sm leading-6 hover:text-gray-900"
              href={item.href}
              prefetch={item.target !== "_blank"}
              target={item.target}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
