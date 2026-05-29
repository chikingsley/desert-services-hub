import { Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/layout/container";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterProps {
  description: string;
  links: FooterLink[];
  address: { street: string; city: string; state: string; zip: string };
  mailingAddress?: { line: string; city: string; state: string; zip: string };
  phone: string;
  fax?: string;
  hours?: { weekdays: string; friday: string };
  copyright: string;
}

export function SiteFooter({
  description,
  links,
  address,
  mailingAddress,
  phone,
  fax,
  hours,
  copyright,
}: FooterProps) {
  return (
    <footer className="bg-[#1a1a2e] text-white/80">
      <Container className="py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* About column */}
          <div className="lg:col-span-2">
            <Image
              alt="Desert Services"
              className="mb-4 h-10 w-auto"
              height={50}
              src="/images/logos/horizontal-white-logo.png"
              width={200}
            />
            <p className="max-w-lg text-sm leading-relaxed">{description}</p>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="mb-4 font-bold font-heading text-sm text-white uppercase tracking-wider">
              Menu
            </h3>
            <nav aria-label="Footer navigation">
              <ul className="list-none space-y-2 p-0">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      className="text-sm transition-colors hover:text-white"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Contact info */}
          <div>
            <h3 className="mb-4 font-bold font-heading text-sm text-white uppercase tracking-wider">
              Contact
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>{address.street}</p>
                  <p>
                    {address.city}, {address.state} {address.zip}
                  </p>
                  {mailingAddress && (
                    <p className="mt-1 text-white/60">
                      Mailing: {mailingAddress.line}, {mailingAddress.city},{" "}
                      {mailingAddress.state} {mailingAddress.zip}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" />
                <div>
                  <a
                    className="transition-colors hover:text-white"
                    href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                  >
                    {phone}
                  </a>
                  {fax && <p className="text-white/60">Fax: {fax}</p>}
                </div>
              </div>

              {hours && (
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p>{hours.weekdays}</p>
                    <p>{hours.friday}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* Bottom bar */}
      <div className="border-white/10 border-t">
        <Container className="flex flex-col items-center justify-between gap-2 py-4 text-white/50 text-xs sm:flex-row">
          <p>{copyright}</p>
          <Link className="hover:text-white/80" href="/privacy-policy/">
            Privacy Policy
          </Link>
        </Container>
      </div>
    </footer>
  );
}
