import { Clock, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactInfoProps {
  address: { street: string; city: string; state: string; zip: string };
  phone: string;
  hours?: string;
  className?: string;
}

export function ContactInfo({
  address,
  phone,
  hours,
  className,
}: ContactInfoProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Address</p>
          <p className="text-muted-foreground">
            {address.street}
            <br />
            {address.city}, {address.state} {address.zip}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Phone className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Phone</p>
          <a
            className="text-muted-foreground transition-colors hover:text-foreground"
            href={`tel:${phone.replace(/[^+\d]/g, "")}`}
          >
            {phone}
          </a>
        </div>
      </div>

      {hours && (
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Hours</p>
            <p className="text-muted-foreground">{hours}</p>
          </div>
        </div>
      )}
    </div>
  );
}
