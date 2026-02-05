import {
  AlertCircle,
  Check,
  ChevronDown,
  Inbox,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  Search,
  Star,
  Tag,
  X,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Email, EmailTag, Project } from "@/types";

interface EmailFeedProps {
  emails: Email[];
  projects: Project[];
  onClose: () => void;
  onToggleRead: (emailId: string) => void;
  onToggleStar: (emailId: string) => void;
  onTagEmail: (emailId: string, tag: EmailTag) => void;
  onRemoveTag: (emailId: string, projectId: string, taskId?: string) => void;
}

type FilterType = "all" | "unread" | "starred" | "action";

export const EmailFeed: React.FC<EmailFeedProps> = ({
  emails,
  projects,
  onClose,
  onToggleRead,
  onToggleStar,
  onTagEmail,
  onRemoveTag,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [taggingEmailId, setTaggingEmailId] = useState<string | null>(null);

  const filteredEmails = useMemo(() => {
    let filtered = emails;

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.subject.toLowerCase().includes(term) ||
          e.from.name.toLowerCase().includes(term) ||
          e.preview.toLowerCase().includes(term)
      );
    }

    // Apply filter
    switch (filter) {
      case "unread":
        filtered = filtered.filter((e) => !e.isRead);
        break;
      case "starred":
        filtered = filtered.filter((e) => e.isStarred);
        break;
      case "action":
        filtered = filtered.filter((e) => e.isActionRequired);
        break;
    }

    // Sort by timestamp (newest first)
    return filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [emails, searchTerm, filter]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedEmailId),
    [emails, selectedEmailId]
  );

  const unreadCount = emails.filter((e) => !e.isRead).length;
  const actionCount = emails.filter((e) => e.isActionRequired).length;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-slate-200 border-b bg-slate-50/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-indigo-600" />
            <h2 className="font-bold text-lg text-slate-900">Email Feed</h2>
            {unreadCount > 0 && (
              <Badge className="bg-indigo-600 text-white" variant="secondary">
                {unreadCount}
              </Badge>
            )}
          </div>
          <Button
            className="h-8 w-8 text-slate-400 hover:text-slate-600"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-9 rounded-lg border-slate-200 bg-white pl-9 text-sm"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search emails..."
            value={searchTerm}
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {(
            [
              { key: "all", label: "All", count: undefined },
              { key: "unread", label: "Unread", count: unreadCount },
              { key: "action", label: "Action", count: actionCount },
              { key: "starred", label: "Starred", count: undefined },
            ] as const
          ).map((f) => (
            <Button
              className={cn(
                "h-7 rounded-md px-2.5 font-medium text-xs",
                filter === f.key
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-slate-500 hover:bg-slate-100"
              )}
              key={f.key}
              onClick={() => setFilter(f.key)}
              size="sm"
              variant="ghost"
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className="ml-1 text-[10px]">({f.count})</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Email list or detail view */}
      {selectedEmail ? (
        <EmailDetail
          email={selectedEmail}
          onBack={() => setSelectedEmailId(null)}
          onRemoveTag={onRemoveTag}
          onTagEmail={onTagEmail}
          onToggleRead={onToggleRead}
          onToggleStar={onToggleStar}
          projects={projects}
        />
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y divide-slate-100">
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Mail className="mb-3 h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-500 text-sm">
                  No emails found
                </p>
              </div>
            ) : (
              filteredEmails.map((email) => (
                <EmailRow
                  email={email}
                  formatDate={formatDate}
                  key={email.id}
                  onClick={() => {
                    setSelectedEmailId(email.id);
                    if (!email.isRead) {
                      onToggleRead(email.id);
                    }
                  }}
                  onRemoveTag={onRemoveTag}
                  onTagEmail={onTagEmail}
                  onToggleRead={onToggleRead}
                  onToggleStar={onToggleStar}
                  projects={projects}
                  showTagMenu={taggingEmailId === email.id}
                  toggleTagMenu={() =>
                    setTaggingEmailId(
                      taggingEmailId === email.id ? null : email.id
                    )
                  }
                />
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

// Individual email row in list
interface EmailRowProps {
  email: Email;
  formatDate: (timestamp: string) => string;
  onClick: () => void;
  onToggleStar: (emailId: string) => void;
  onToggleRead: (emailId: string) => void;
  onTagEmail: (emailId: string, tag: EmailTag) => void;
  onRemoveTag: (emailId: string, projectId: string, taskId?: string) => void;
  projects: Project[];
  showTagMenu: boolean;
  toggleTagMenu: () => void;
}

const EmailRow: React.FC<EmailRowProps> = ({
  email,
  formatDate,
  onClick,
  onToggleStar,
  onTagEmail,
  projects,
}) => {
  return (
    <div
      className={cn(
        "group relative cursor-pointer px-4 py-3 transition-colors hover:bg-slate-50",
        !email.isRead && "bg-indigo-50/30",
        email.isActionRequired && "border-amber-200 border-l-2"
      )}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start gap-3">
        {/* Star button */}
        <button
          className={cn(
            "mt-0.5 flex-shrink-0 transition-colors",
            email.isStarred
              ? "text-amber-400"
              : "text-slate-300 hover:text-amber-400"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(email.id);
          }}
          type="button"
        >
          <Star
            className={cn("h-4 w-4", email.isStarred && "fill-amber-400")}
          />
        </button>

        {/* Email content */}
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "truncate text-sm",
                  email.isRead
                    ? "font-medium text-slate-600"
                    : "font-semibold text-slate-900"
                )}
              >
                {email.from.name}
              </span>
              {email.isActionRequired && (
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
              )}
            </div>
            <span className="flex-shrink-0 font-medium text-[11px] text-slate-400">
              {formatDate(email.timestamp)}
            </span>
          </div>

          <p
            className={cn(
              "mb-1 truncate text-sm",
              email.isRead
                ? "font-normal text-slate-600"
                : "font-medium text-slate-800"
            )}
          >
            {email.subject}
          </p>

          <p className="mb-2 truncate text-slate-500 text-xs">
            {email.preview}
          </p>

          {/* Tags and attachments row */}
          <div className="flex items-center gap-2">
            {email.attachments.length > 0 && (
              <div className="flex items-center gap-1 text-slate-400">
                <Paperclip className="h-3 w-3" />
                <span className="text-[10px]">{email.attachments.length}</span>
              </div>
            )}

            {email.tags.map((tag) => (
              <Badge
                className="h-5 gap-1 bg-slate-100 px-1.5 font-medium text-[10px] text-slate-600 hover:bg-slate-200"
                key={`${tag.projectId}-${tag.taskId || "project"}`}
                variant="secondary"
              >
                {tag.taskName || tag.projectName}
              </Badge>
            ))}

            {/* Tag button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-5 items-center gap-0.5 rounded border border-slate-300 border-dashed px-1.5 text-slate-400 opacity-0 transition-opacity hover:border-indigo-400 hover:text-indigo-500 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  type="button"
                >
                  <Plus className="h-3 w-3" />
                  <Tag className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 font-medium text-slate-500 text-xs">
                  Tag with project/task
                </div>
                <DropdownMenuSeparator />
                {projects.map((project) => (
                  <DropdownMenu key={project.id}>
                    <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-slate-100">
                      <span>{project.name}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48" side="right">
                      <DropdownMenuItem
                        onClick={() =>
                          onTagEmail(email.id, {
                            projectId: project.id,
                            projectName: project.name,
                          })
                        }
                      >
                        <span className="font-medium">Project only</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {project.tasks.map((task) => (
                        <DropdownMenuItem
                          key={task.id}
                          onClick={() =>
                            onTagEmail(email.id, {
                              projectId: project.id,
                              projectName: project.name,
                              taskId: task.id,
                              taskName: task.name,
                            })
                          }
                        >
                          {task.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
};

// Email detail view
interface EmailDetailProps {
  email: Email;
  onBack: () => void;
  onToggleStar: (emailId: string) => void;
  onToggleRead: (emailId: string) => void;
  onTagEmail: (emailId: string, tag: EmailTag) => void;
  onRemoveTag: (emailId: string, projectId: string, taskId?: string) => void;
  projects: Project[];
}

const EmailDetail: React.FC<EmailDetailProps> = ({
  email,
  onBack,
  onToggleStar,
  onToggleRead,
  onTagEmail,
  onRemoveTag,
  projects,
}) => {
  return (
    <div className="flex flex-1 flex-col">
      {/* Detail header */}
      <div className="flex items-center gap-2 border-slate-100 border-b px-4 py-3">
        <Button onClick={onBack} size="sm" variant="ghost">
          <ChevronDown className="mr-1 h-4 w-4 rotate-90" />
          Back
        </Button>
        <div className="flex-1" />
        <Button
          onClick={() => onToggleStar(email.id)}
          size="icon"
          variant="ghost"
        >
          <Star
            className={cn(
              "h-4 w-4",
              email.isStarred
                ? "fill-amber-400 text-amber-400"
                : "text-slate-400"
            )}
          />
        </Button>
        <Button
          onClick={() => onToggleRead(email.id)}
          size="icon"
          variant="ghost"
        >
          {email.isRead ? (
            <MailOpen className="h-4 w-4 text-slate-400" />
          ) : (
            <Mail className="h-4 w-4 text-indigo-600" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Subject */}
          <h3 className="mb-3 font-semibold text-lg text-slate-900">
            {email.subject}
          </h3>

          {/* From/To */}
          <div className="mb-4 space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="w-12 text-slate-400">From:</span>
              <span className="font-medium text-slate-700">
                {email.from.name}{" "}
                <span className="text-slate-400">
                  &lt;{email.from.email}&gt;
                </span>
              </span>
            </div>
            <div className="flex gap-2">
              <span className="w-12 text-slate-400">To:</span>
              <span className="text-slate-600">{email.to.join(", ")}</span>
            </div>
            {email.cc && email.cc.length > 0 && (
              <div className="flex gap-2">
                <span className="w-12 text-slate-400">CC:</span>
                <span className="text-slate-600">{email.cc.join(", ")}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="w-12 text-slate-400">Date:</span>
              <span className="text-slate-600">
                {new Date(email.timestamp).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Tags */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-500 text-xs">Tags:</span>
            {email.tags.map((tag) => (
              <Badge
                className="group/tag h-6 gap-1 bg-indigo-100 pr-1 font-medium text-indigo-700"
                key={`${tag.projectId}-${tag.taskId || "project"}`}
                variant="secondary"
              >
                {tag.taskName
                  ? `${tag.projectName} / ${tag.taskName}`
                  : tag.projectName}
                <button
                  className="ml-0.5 rounded p-0.5 opacity-60 transition-opacity hover:bg-indigo-200 hover:opacity-100"
                  onClick={() =>
                    onRemoveTag(email.id, tag.projectId, tag.taskId)
                  }
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}

            {/* Add tag dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="h-6 gap-1 border-dashed text-xs"
                  size="sm"
                  variant="outline"
                >
                  <Plus className="h-3 w-3" />
                  Add tag
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {projects.map((project) => (
                  <DropdownMenu key={project.id}>
                    <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-slate-100">
                      <span>{project.name}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48" side="right">
                      <DropdownMenuItem
                        onClick={() =>
                          onTagEmail(email.id, {
                            projectId: project.id,
                            projectName: project.name,
                          })
                        }
                      >
                        <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                        Project only
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {project.tasks.map((task) => (
                        <DropdownMenuItem
                          key={task.id}
                          onClick={() =>
                            onTagEmail(email.id, {
                              projectId: project.id,
                              projectName: project.name,
                              taskId: task.id,
                              taskName: task.name,
                            })
                          }
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3.5 w-3.5",
                              email.tags.some(
                                (t) =>
                                  t.projectId === project.id &&
                                  t.taskId === task.id
                              )
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {task.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="mb-4">
              <span className="mb-2 block font-medium text-slate-500 text-xs">
                Attachments ({email.attachments.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((att) => (
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100"
                    key={att.id}
                  >
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-700 text-sm">
                      {att.name}
                    </span>
                    {att.size && (
                      <span className="text-slate-400 text-xs">{att.size}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="whitespace-pre-wrap text-slate-700 text-sm leading-relaxed">
              {email.body}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Reply area */}
      <div className="border-slate-200 border-t bg-slate-50 p-4">
        <Button className="w-full" variant="outline">
          <Mail className="mr-2 h-4 w-4" />
          Reply
        </Button>
      </div>
    </div>
  );
};
