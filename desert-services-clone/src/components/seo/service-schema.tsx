import type { Service, WithContext } from "schema-dts";
import { JsonLd } from "@/components/seo/json-ld";

interface ServiceSchemaProps {
  name: string;
  description: string;
  url: string;
  providerName: string;
  providerUrl: string;
  areaServed?: string;
}

export function ServiceSchema({
  name,
  description,
  url,
  providerName,
  providerUrl,
  areaServed,
}: ServiceSchemaProps) {
  const data: WithContext<Service> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url,
    provider: {
      "@type": "LocalBusiness",
      "@id": `${providerUrl}/#organization`,
      name: providerName,
    },
    areaServed: areaServed ? { "@type": "State", name: areaServed } : undefined,
  };

  return <JsonLd data={data} />;
}
