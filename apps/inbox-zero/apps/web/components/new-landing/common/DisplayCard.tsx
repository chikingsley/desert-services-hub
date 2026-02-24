import { Card } from "@/components/new-landing/common/Card";
import { cn } from "@/utils";

interface DisplayCardProps {
  cardHeaderClassName?: string;
  centerContent?: boolean;
  children: React.ReactNode;
  className?: string;
  description: string;
  icon: React.ReactNode;
  title: string;
}

export function DisplayCard({
  title,
  description,
  icon,
  children,
  centerContent = false,
  className,
  cardHeaderClassName,
}: DisplayCardProps) {
  return (
    <Card
      cardHeaderClassName={cardHeaderClassName}
      className={cn("h-full overflow-hidden", className)}
      description={description}
      icon={icon}
      title={title}
      variant="extra-rounding"
    >
      <div
        className={cn(
          "flex h-full min-h-40 border-[#F6F6F6] border-t bg-[#FCFCFC]",
          centerContent ? "items-center justify-center" : "items-end"
        )}
      >
        {children}
      </div>
    </Card>
  );
}
