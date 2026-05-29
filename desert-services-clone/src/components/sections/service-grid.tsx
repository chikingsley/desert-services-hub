import { Container } from "@/components/layout/container";
import { ServiceCard } from "@/components/sections/service-card";
import { cn } from "@/lib/utils";

interface ServiceItem {
  title: string;
  shortDescription: string;
  slug: string;
  heroImage: string;
}

export function ServiceGrid({
  services,
  className,
}: {
  services: ServiceItem[];
  className?: string;
}) {
  return (
    <Container className={cn("py-16 md:py-20", className)}>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard
            description={service.shortDescription}
            href={`/services/${service.slug}/`}
            image={service.heroImage}
            key={service.slug}
            title={service.title}
          />
        ))}
      </div>
    </Container>
  );
}
