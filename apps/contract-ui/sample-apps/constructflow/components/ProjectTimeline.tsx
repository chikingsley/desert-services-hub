import { Check, FileText, Mail, Paperclip } from "lucide-react";
import type { Attachment, Email } from "../types";

interface ProjectTimelineProps {
  emails: Email[];
  files: Attachment[];
  highlightId?: string;
}

const ProjectTimeline = ({
  emails,
  files,
  highlightId,
}: ProjectTimelineProps) => {
  const timelineItems = [
    ...emails.map((e) => ({
      type: "email" as const,
      date: e.timestamp,
      data: e,
      id: e.id,
    })),
    ...files.map((f) => ({
      type: "file" as const,
      date: "Jan 27, 2026",
      data: f,
      id: f.id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute top-0 bottom-0 left-5 w-px bg-border" />

      <div className="space-y-4">
        {timelineItems.map((item, idx) => {
          const isHighlighted = item.id === highlightId;

          return (
            <div className="relative pl-14" key={idx}>
              {/* Timeline node */}
              <div
                className={`absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                  isHighlighted
                    ? "bg-accent text-white"
                    : "border border-border bg-surface-raised"
                }`}
              >
                {item.type === "email" ? (
                  <Mail
                    className={isHighlighted ? "text-white" : "text-ink-subtle"}
                    size={16}
                    strokeWidth={1.5}
                  />
                ) : (
                  <FileText
                    className={isHighlighted ? "text-white" : "text-ink-subtle"}
                    size={16}
                    strokeWidth={1.5}
                  />
                )}
              </div>

              <div
                className={`industrial-card rounded-lg transition-all ${
                  isHighlighted ? "border-accent shadow-md" : "border-border"
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-border border-b px-5 py-3">
                  <span className="font-mono text-[11px] text-ink-subtle">
                    {item.date}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.type === "email" &&
                      (item.data as Email).tags.map((tag) => (
                        <span
                          className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-ink-subtle uppercase"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    {isHighlighted && (
                      <span className="rounded bg-accent px-2 py-0.5 font-mono text-[10px] text-white uppercase">
                        New
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-5">
                  {item.type === "email" ? (
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="font-medium text-[14px] text-ink">
                          {(item.data as Email).sender}
                        </h4>
                      </div>
                      <p className="mb-3 text-[12px] text-ink-subtle">
                        Re: {(item.data as Email).subject}
                      </p>
                      <p className="text-[13px] text-ink-muted leading-relaxed">
                        {(item.data as Email).body}
                      </p>

                      {(item.data as Email).attachments.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(item.data as Email).attachments.map((att) => (
                            <div
                              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-surface-sunken px-3 py-2 text-[12px] text-ink-muted transition-colors hover:bg-accent/10 hover:text-accent"
                              key={att.id}
                            >
                              <Paperclip size={12} />
                              {att.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-sunken">
                        <FileText className="text-ink-subtle" size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-[14px] text-ink">
                          {(item.data as Attachment).name}
                        </p>
                        <p className="text-[12px] text-ink-subtle">
                          <span className="uppercase">
                            {(item.data as Attachment).category}
                          </span>
                          <span className="mx-2">·</span>
                          {(item.data as Attachment).size}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* End marker */}
        <div className="relative pl-14">
          <div className="absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-sunken">
            <Check className="text-ink-subtle" size={16} />
          </div>
          <p className="py-3 text-[13px] text-ink-subtle italic">
            End of history
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProjectTimeline;
