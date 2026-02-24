import {
  HoverCardContent,
  HoverCardTrigger,
  HoverCard as HoverCardUi,
} from "@/components/ui/hover-card";
import { cn } from "@/utils";

export function HoverCard(props: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  return (
    <HoverCardUi closeDelay={100} openDelay={100}>
      <HoverCardTrigger asChild>{props.children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className={cn("overflow-hidden", props.className)}
        side="right"
      >
        {props.content}
      </HoverCardContent>
    </HoverCardUi>
  );
}
