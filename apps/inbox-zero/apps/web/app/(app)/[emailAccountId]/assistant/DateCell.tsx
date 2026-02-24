import { EmailDate } from "@/components/email-list/EmailDate";
import { Tooltip } from "@/components/Tooltip";

export function DateCell({ createdAt }: { createdAt: Date }) {
  return (
    <div className="whitespace-nowrap">
      <Tooltip content={new Date(createdAt).toLocaleString()}>
        <EmailDate date={new Date(createdAt)} />
      </Tooltip>
    </div>
  );
}
