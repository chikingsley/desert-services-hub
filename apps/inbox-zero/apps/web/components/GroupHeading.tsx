// import { Checkbox } from "@/components/Checkbox";
import type React from "react";
import { Button } from "@/components/Button";

export function GroupHeading(props: {
  leftContent: React.ReactNode;
  buttons?: { label: string; loading?: boolean; onClick: () => void }[];
}) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-6 content-container sm:flex-nowrap">
      {/* <div className="border-l-4 border-transparent">
        <Checkbox checked onChange={() => {}} />
      </div> */}

      <h1 className="font-semibold text-base text-primary leading-7">
        {props.leftContent}
      </h1>

      <div className="ml-auto flex items-center gap-x-1 py-2">
        {props.buttons?.map((button) => (
          <Button
            key={button.label}
            loading={button.loading}
            onClick={button.onClick}
            size="md"
          >
            {button.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
