import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeroSectionProps {
  heading: string;
  subheading?: string;
  cta?: { label: string; href: string };
  backgroundImage?: string;
  overlay?: boolean;
  compact?: boolean;
  className?: string;
}

export function HeroSection({
  heading,
  subheading,
  cta,
  backgroundImage,
  overlay = true,
  compact = false,
  className,
}: HeroSectionProps) {
  return (
    <section
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-[#1a1a2e] text-white",
        compact ? "py-16 md:py-20" : "py-24 md:py-32 lg:py-40",
        className
      )}
    >
      {backgroundImage && (
        <>
          <Image
            alt=""
            className="object-cover"
            fill
            priority
            sizes="100vw"
            src={backgroundImage}
          />
          {overlay && (
            <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
          )}
        </>
      )}
      <Container className="relative z-10 text-center">
        <h1 className="font-bold font-heading text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
          {heading}
        </h1>
        {subheading && (
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80 md:text-xl">
            {subheading}
          </p>
        )}
        {cta && (
          <div className="mt-8">
            <Button
              asChild
              className="font-semibold text-base"
              size="lg"
              variant="secondary"
            >
              <Link href={cta.href}>{cta.label}</Link>
            </Button>
          </div>
        )}
      </Container>
    </section>
  );
}
