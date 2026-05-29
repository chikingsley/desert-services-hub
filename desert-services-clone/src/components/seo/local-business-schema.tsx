import type { LocalBusiness, WithContext } from "schema-dts";
import { JsonLd } from "@/components/seo/json-ld";

interface LocalBusinessSchemaProps {
  name: string;
  description: string;
  url: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  areaServed?: string;
  logo?: string;
}

export function LocalBusinessSchema({
  name,
  description,
  url,
  phone,
  address,
  areaServed,
  logo,
}: LocalBusinessSchemaProps) {
  const data: WithContext<LocalBusiness> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}/#organization`,
    name,
    description,
    url,
    telephone: phone,
    logo: logo ? `${url}${logo}` : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: address.street,
      addressLocality: address.city,
      addressRegion: address.state,
      postalCode: address.zip,
      addressCountry: "US",
    },
    areaServed: areaServed ? { "@type": "State", name: areaServed } : undefined,
  };

  return <JsonLd data={data} />;
}
