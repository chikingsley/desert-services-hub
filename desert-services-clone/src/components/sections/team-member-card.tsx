import Image from "next/image";
import { cn } from "@/lib/utils";

interface TeamMemberCardProps {
  name: string;
  title: string;
  image: string;
  className?: string;
}

export function TeamMemberCard({
  name,
  title,
  image,
  className,
}: TeamMemberCardProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="relative mb-4 size-32 overflow-hidden rounded-full sm:size-36 md:size-40">
        <Image
          alt={name}
          className="object-cover"
          fill
          sizes="160px"
          src={image}
        />
      </div>
      <h3 className="font-bold font-heading text-base">{name}</h3>
      <p className="mt-1 text-muted-foreground text-sm">{title}</p>
    </div>
  );
}
