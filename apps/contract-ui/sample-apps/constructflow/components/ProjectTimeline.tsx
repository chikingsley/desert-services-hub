import type { Email, Attachment } from '../types';
import { Mail, FileText, Paperclip, Check } from 'lucide-react';

interface ProjectTimelineProps {
  emails: Email[];
  files: Attachment[];
  highlightId?: string;
}

const ProjectTimeline = ({ emails, files, highlightId }: ProjectTimelineProps) => {
  const timelineItems = [
    ...emails.map(e => ({ type: 'email' as const, date: e.timestamp, data: e, id: e.id })),
    ...files.map(f => ({ type: 'file' as const, date: 'Jan 27, 2026', data: f, id: f.id }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {timelineItems.map((item, idx) => {
          const isHighlighted = item.id === highlightId;

          return (
            <div key={idx} className="relative pl-14">
              {/* Timeline node */}
              <div className={`absolute left-0 top-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all ${isHighlighted
                  ? 'bg-accent text-white'
                  : 'bg-surface-raised border border-border'
                }`}>
                {item.type === 'email' ? (
                  <Mail size={16} strokeWidth={1.5} className={isHighlighted ? 'text-white' : 'text-ink-subtle'} />
                ) : (
                  <FileText size={16} strokeWidth={1.5} className={isHighlighted ? 'text-white' : 'text-ink-subtle'} />
                )}
              </div>

              <div className={`industrial-card rounded-lg transition-all ${isHighlighted ? 'border-accent shadow-md' : 'border-border'
                }`}>
                {/* Header */}
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <span className="font-mono text-[11px] text-ink-subtle">{item.date}</span>
                  <div className="flex items-center gap-2">
                    {item.type === 'email' && (item.data as Email).tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono px-2 py-0.5 bg-surface-sunken text-ink-subtle rounded uppercase"
                      >
                        {tag}
                      </span>
                    ))}
                    {isHighlighted && (
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-accent text-white rounded uppercase">
                        New
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-5">
                  {item.type === 'email' ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-[14px] font-medium text-ink">{(item.data as Email).sender}</h4>
                      </div>
                      <p className="text-[12px] text-ink-subtle mb-3">Re: {(item.data as Email).subject}</p>
                      <p className="text-[13px] text-ink-muted leading-relaxed">{(item.data as Email).body}</p>

                      {(item.data as Email).attachments.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(item.data as Email).attachments.map(att => (
                            <div
                              key={att.id}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-surface-sunken rounded-md text-[12px] text-ink-muted hover:bg-accent/10 hover:text-accent cursor-pointer transition-colors"
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
                      <div className="w-12 h-12 rounded-lg bg-surface-sunken flex items-center justify-center">
                        <FileText size={20} className="text-ink-subtle" />
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-ink">{(item.data as Attachment).name}</p>
                        <p className="text-[12px] text-ink-subtle">
                          <span className="uppercase">{(item.data as Attachment).category}</span>
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
          <div className="absolute left-0 top-0 w-10 h-10 rounded-lg bg-surface-sunken border border-border flex items-center justify-center">
            <Check size={16} className="text-ink-subtle" />
          </div>
          <p className="text-[13px] text-ink-subtle italic py-3">End of history</p>
        </div>
      </div>
    </div>
  );
};

export default ProjectTimeline;
