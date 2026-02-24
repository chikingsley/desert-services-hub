"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Card, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";

type FeatureItem = {
  icon: ReactNode;
  title: string;
  description: string;
};

type SetupContentProps = {
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
  features: FeatureItem[];
  children: ReactNode;
};

export function SetupCard(props: SetupContentProps) {
  return (
    <Card className="mx-4 mt-10 max-w-lg p-6 md:mx-auto">
      <SetupContent {...props} />
    </Card>
  );
}

export function SetupDialog({
  open,
  onOpenChange,
  ...props
}: SetupContentProps & {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <SetupContent {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SetupContent({
  imageSrc,
  imageAlt,
  title,
  description,
  features,
  children,
}: SetupContentProps) {
  return (
    <>
      <Image
        alt={imageAlt}
        className="mx-auto dark:brightness-90 dark:invert"
        height={200}
        src={imageSrc}
        unoptimized
        width={200}
      />

      <div className="text-center">
        <TypographyH3>{title}</TypographyH3>
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          {description}
        </SectionDescription>
      </div>

      <ItemGroup>
        {features.map((feature) => (
          <Item key={feature.title}>
            {feature.icon}
            <ItemContent>
              <ItemTitle>{feature.title}</ItemTitle>
              <ItemDescription>{feature.description}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>

      <CardFooter className="flex flex-col items-center gap-4 p-0">
        {children}
      </CardFooter>
    </>
  );
}
