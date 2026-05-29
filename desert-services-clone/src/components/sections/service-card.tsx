import Image from "next/image";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  title: string;
  description: string;
  href: string;
  image?: string;
  className?: string;
}

export function ServiceCard({
  title,
  description,
  href,
  image,
  className,
}: ServiceCardProps) {
  return (
    <Link className="group" href={href}>
      <Card
        className={cn(
          "h-full overflow-hidden transition-shadow hover:shadow-lg",
          className
        )}
      >
        {image && (
          <div className="relative aspect-[16/10] overflow-hidden">
            <Image
              alt={title}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              src={image}
            />
          </div>
        )}
        <CardHeader>
          <CardTitle className="font-heading text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="line-clamp-3">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}
