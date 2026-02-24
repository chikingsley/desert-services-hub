import { ArrowRightIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ContinueButton(props: ButtonProps) {
  return (
    <Button size="sm" {...props}>
      Continue <ArrowRightIcon className="ml-2 size-4" />
    </Button>
  );
}
