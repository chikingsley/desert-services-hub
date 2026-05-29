import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CTASectionProps {
  heading: string;
  description?: string;
  cta: { label: string; href: string };
  phone?: string;
  variant?: "default" | "dark";
  className?: string;
}

export function CTASection({
  heading,
  description,
  cta,
  phone,
  variant = "dark",
  className,
}: CTASectionProps) {
  return (
    <section
      className={cn(
        "py-16 md:py-20",
        variant === "dark" ? "bg-[#1a1a2e] text-white" : "bg-muted",
        className
      )}
    >
      <Container className="text-center">
        <h2 className="font-bold font-heading text-2xl md:text-3xl">
          {heading}
        </h2>
        {description && (
          <p
            className={cn(
              "mx-auto mt-4 max-w-2xl text-lg",
              variant === "dark" ? "text-white/80" : "text-muted-foreground"
            )}
          >
            {description}
          </p>
        )}
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button
            asChild
            size="lg"
            variant={variant === "dark" ? "secondary" : "default"}
          >
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
          {phone && (
            <Button
              asChild
              className={
                variant === "dark"
                  ? "border-white/30 text-white hover:bg-white/10"
                  : ""
              }
              size="lg"
              variant="outline"
            >
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>
            </Button>
          )}
        </div>
      </Container>
    </section>
  );
}
