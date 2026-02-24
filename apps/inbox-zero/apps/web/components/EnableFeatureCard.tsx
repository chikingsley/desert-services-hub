"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";

interface EnableFeatureCardProps {
  buttonText: string;
  description: React.ReactNode;
  extraDescription?: React.ReactNode;
  hideBorder?: boolean;
  href?: string;
  imageAlt: string;
  imageSrc: string;
  onEnable?: () => Promise<void>;
  title: string;
}

export function EnableFeatureCard({
  title,
  description,
  extraDescription,
  imageSrc,
  imageAlt,
  buttonText,
  href,
  hideBorder,
  onEnable,
}: EnableFeatureCardProps) {
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    await onEnable?.();
    setLoading(false);
  };

  return (
    <Card
      className={cn(
        "mx-4 mt-10 max-w-2xl p-6 md:mx-auto",
        hideBorder && "border-none shadow-none"
      )}
    >
      <div className="text-center">
        <Image
          alt={imageAlt}
          className="mx-auto dark:brightness-90 dark:invert"
          height={200}
          src={imageSrc}
          unoptimized
          width={200}
        />

        <TypographyH3 className="mt-2">{title}</TypographyH3>
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          {description}
        </SectionDescription>
        {extraDescription}
        <div className="mt-6">
          {href ? (
            <Button asChild>
              <Link href={href}>{buttonText}</Link>
            </Button>
          ) : (
            <Button loading={loading} onClick={handleEnable}>
              {buttonText}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
