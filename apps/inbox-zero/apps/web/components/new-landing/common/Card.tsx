import { cva } from "class-variance-authority";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { cn } from "@/utils";

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

interface CardHeaderProps {
  addon?: React.ReactNode;
  className?: string;
  description?: string;
  icon?: React.ReactNode;
  title?: string;
}

export function CardHeader({
  title,
  icon,
  addon,
  description,
  className,
}: CardHeaderProps) {
  return (
    <CardContent className={className}>
      {title || addon ? (
        <div className="flex items-center justify-between">
          {icon}
          {addon}
        </div>
      ) : null}
      {title ? (
        <h2
          className={cn(
            "font-title text-xl leading-6",
            title || addon ? "mt-5" : ""
          )}
        >
          {title}
        </h2>
      ) : null}
      {description ? (
        <Paragraph className="mt-3" size="sm">
          {description}
        </Paragraph>
      ) : null}
    </CardContent>
  );
}

interface CardProps {
  addon?: React.ReactNode;
  cardHeaderClassName?: string;
  children: React.ReactNode;
  className?: string;
  description?: string;
  icon?: React.ReactNode;
  title?: string;
  variant?: "default" | "extra-rounding" | "circle";
}

export function Card({
  children,
  variant = "default",
  icon,
  addon,
  title,
  description,
  className,
  cardHeaderClassName,
}: CardProps) {
  const cardVariants = cva(
    [
      "flex flex-col border border-[#E7E7E780] bg-white text-left shadow-[0px_3px_12.9px_0px_#97979714]",
    ],
    {
      variants: {
        variant: {
          circle: "rounded-full",
          "extra-rounding": "rounded-[32px]",
          default: "rounded-[20px]",
        },
      },
    }
  );
  return (
    <div className={cardVariants({ variant, className })}>
      {title || icon || addon ? (
        <CardHeader
          addon={addon}
          className={cardHeaderClassName}
          description={description}
          icon={icon}
          title={title}
        />
      ) : null}
      {children}
    </div>
  );
}
