import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/utils";

const PageHeading = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    className={cn(
      "font-title text-2xl text-primary leading-7 sm:truncate lg:text-3xl dark:text-foreground",
      className
    )}
    ref={ref}
    {...props}
  />
));
PageHeading.displayName = "PageHeading";

const PageSubHeading = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn("text-muted-foreground text-sm", className)}
    ref={ref}
    {...props}
  />
));
PageSubHeading.displayName = "PageSubHeading";

const SectionHeader = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h4
    className={cn("font-title text-base text-foreground leading-7", className)}
    ref={ref}
    {...props}
  />
));
SectionHeader.displayName = "SectionHeader";

const SectionDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn(
      "mt-1 text-slate-700 text-sm leading-6 dark:text-foreground",
      className
    )}
    ref={ref}
    {...props}
  />
));
SectionDescription.displayName = "SectionDescription";

const MessageText = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn("text-slate-700 text-sm dark:text-foreground", className)}
    ref={ref}
    {...props}
  />
));
MessageText.displayName = "MessageText";

const TypographyH3 = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    className={cn("scroll-m-20 font-title text-2xl", className)}
    ref={ref}
    {...props}
  />
));
TypographyH3.displayName = "TypographyH3";

const TypographyH4 = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h4 className={cn("font-title text-lg", className)} ref={ref} {...props} />
));
TypographyH4.displayName = "TypographyH4";

const TypographyP = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn("text-muted-foreground leading-7", className)}
    ref={ref}
    {...props}
  />
));
TypographyP.displayName = "TypographyP";

const MutedText = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    className={cn("text-muted-foreground text-sm", className)}
    ref={ref}
    {...props}
  />
));
MutedText.displayName = "MutedText";

type LinkProps = React.ComponentProps<typeof Link>;
const TextLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, ...props }, ref) => {
    return (
      <Link
        className={cn(
          "font-semibold text-blue-600 hover:underline dark:text-primary",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

TextLink.displayName = "TextLink";

export {
  PageHeading,
  PageSubHeading,
  SectionHeader,
  TypographyH3,
  TypographyH4,
  SectionDescription,
  MessageText,
  TypographyP,
  MutedText,
  TextLink,
};
