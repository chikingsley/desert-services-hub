import {
	AlertCircle,
	ChevronDown,
	ChevronRight,
	Circle,
	Clock,
	FileText,
	Mail,
	MessageSquare,
	Paperclip,
	Plus,
	RefreshCw,
	Send,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Email, EmailTag, Project, ThreadItem } from "@/types";

// Unified feed item type
type FeedItem =
	| { type: "email"; data: Email; timestamp: Date }
	| { type: "history"; data: ThreadItem; timestamp: Date };

interface ProjectFeedProps {
	project: Project;
	emails: Email[];
	focusedTaskID: string | null;
	onClose: () => void;
	onFocusTask: (taskId: string | null) => void;
	onToggleEmailRead: (emailId: string) => void;
	onToggleEmailStar: (emailId: string) => void;
	onTagEmail: (emailId: string, tag: EmailTag) => void;
	onRemoveTag: (emailId: string, projectId: string, taskId?: string) => void;
	allProjects: Project[];
}

export const ProjectFeed: React.FC<ProjectFeedProps> = ({
	project,
	emails,
	focusedTaskID,
	onClose,
	onFocusTask,
	onToggleEmailRead,
	onToggleEmailStar,
	onTagEmail,
	onRemoveTag,
	allProjects,
}) => {
	const [replyText, setReplyText] = useState("");
	const [expandedEmailIds, setExpandedEmailIds] = useState<Set<string>>(
		new Set(),
	);

	// Get emails tagged with this project
	const projectEmails = useMemo(() => {
		return emails.filter((e) => e.tags.some((t) => t.projectId === project.id));
	}, [emails, project.id]);

	// Build unified feed from history items + emails
	const feedItems = useMemo(() => {
		const items: FeedItem[] = [];

		// Add history items from tasks
		for (const task of project.tasks) {
			// Skip if filtering by task and this isn't the focused task
			if (focusedTaskID && task.id !== focusedTaskID) continue;

			for (const historyItem of task.history) {
				items.push({
					type: "history",
					data: { ...historyItem, taskId: task.id, taskName: task.name },
					timestamp: new Date(historyItem.timestamp),
				});
			}
		}

		// Add emails (filter by task if focused)
		for (const email of projectEmails) {
			// If filtering by task, only show emails tagged with that task
			if (focusedTaskID) {
				const hasTaskTag = email.tags.some(
					(t) => t.projectId === project.id && t.taskId === focusedTaskID,
				);
				if (!hasTaskTag) continue;
			}

			items.push({
				type: "email",
				data: email,
				timestamp: new Date(email.timestamp),
			});
		}

		// Sort by timestamp, newest first
		return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}, [project, projectEmails, focusedTaskID]);

	const toggleEmailExpanded = (emailId: string) => {
		setExpandedEmailIds((prev) => {
			const next = new Set(prev);
			if (next.has(emailId)) {
				next.delete(emailId);
			} else {
				next.add(emailId);
			}
			return next;
		});
	};

	const formatDate = (date: Date) => {
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		if (isToday) {
			return date.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
			});
		}
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	return (
		<div className="flex h-full flex-col bg-white">
			{/* Header */}
			<div className="border-slate-100 border-b bg-slate-50/50 p-6">
				<div className="mb-4 flex items-start justify-between">
					<div>
						<h2 className="mb-1 font-black text-[10px] text-indigo-600 uppercase tracking-widest">
							Project Feed
						</h2>
						<h3 className="font-black text-slate-900 text-xl leading-none">
							{project.name}
						</h3>
						{focusedTaskID &&
							project.tasks.find((t) => t.id === focusedTaskID)
								?.primaryAction && (
								<div className="mt-2 flex items-center gap-1.5 font-black text-[10px] text-indigo-600 uppercase tracking-widest animate-pulse">
									<div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
									Next Step:{" "}
									{
										project.tasks.find((t) => t.id === focusedTaskID)
											?.primaryAction
									}
								</div>
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

				{/* Task filter tabs */}
				<ScrollArea className="w-full whitespace-nowrap">
					<div className="flex gap-2 pb-1">
						<Button
							className={cn(
								"h-8 rounded-full font-black text-[10px] uppercase tracking-widest transition-all",
								!focusedTaskID
									? "bg-indigo-600 text-white shadow-lg"
									: "border-slate-200 bg-white text-slate-400 hover:border-indigo-200",
							)}
							onClick={() => onFocusTask(null)}
							size="sm"
							variant={focusedTaskID ? "outline" : "default"}
						>
							All Activity
						</Button>
						{project.tasks.map((task) => (
							<Button
								className={cn(
									"h-8 rounded-full font-black text-[10px] uppercase tracking-widest transition-all",
									focusedTaskID === task.id
										? "bg-indigo-600 text-white shadow-lg"
										: "border-slate-200 bg-white text-slate-400 hover:border-indigo-200",
								)}
								key={task.id}
								onClick={() => onFocusTask(task.id)}
								size="sm"
								variant={focusedTaskID === task.id ? "default" : "outline"}
							>
								{task.name}
							</Button>
						))}
					</div>
				</ScrollArea>
			</div>

			{/* Feed Content */}
			<ScrollArea className="flex-1">
				<div className="space-y-4 bg-[#fdfdfe] p-6">
					{feedItems.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center py-20 text-center opacity-40">
							<Clock className="mb-4 h-12 w-12 text-slate-300" />
							<p className="font-bold text-slate-500 text-xs uppercase tracking-widest">
								No activity for this selection
							</p>
						</div>
					) : (
						feedItems.map((item, index) => (
							<div
								className="relative pl-8"
								key={`${item.type}-${item.type === "email" ? item.data.id : item.data.id}`}
							>
								{/* Vertical line connector */}
								{index < feedItems.length - 1 && (
									<div className="absolute top-8 bottom-0 left-3.5 w-px bg-slate-100" />
								)}

								{item.type === "email" ? (
									<EmailFeedItem
										allProjects={allProjects}
										email={item.data}
										formatDate={formatDate}
										isExpanded={expandedEmailIds.has(item.data.id)}
										onRemoveTag={onRemoveTag}
										onTagEmail={onTagEmail}
										onToggleExpand={() => toggleEmailExpanded(item.data.id)}
										onToggleRead={onToggleEmailRead}
										onToggleStar={onToggleEmailStar}
									/>
								) : (
									<HistoryFeedItem formatDate={formatDate} item={item.data} />
								)}
							</div>
						))
					)}
				</div>
			</ScrollArea>

			{/* Quick Reply */}
			<div className="border-slate-100 border-t bg-white p-6 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
				<div className="flex flex-col gap-3">
					<div className="flex gap-2">
						<Button
							className="h-7 rounded-lg bg-slate-50 px-2 py-1 font-bold text-[10px] text-slate-400 uppercase tracking-widest transition-all hover:text-indigo-600"
							size="sm"
							variant="ghost"
						>
							Draft Response
						</Button>
						<Button
							className="h-7 rounded-lg bg-slate-50 px-2 py-1 font-bold text-[10px] text-slate-400 uppercase tracking-widest transition-all hover:text-indigo-600"
							size="sm"
							variant="ghost"
						>
							Internal Note
						</Button>
					</div>
					<div className="relative">
						<Textarea
							className="min-h-[80px] w-full resize-none rounded-2xl border-slate-200 bg-slate-50 p-4 text-sm transition-all focus-visible:ring-indigo-500"
							onChange={(e) => setReplyText(e.target.value)}
							placeholder="Add a note or draft a response..."
							value={replyText}
						/>
						<Button
							className="absolute right-3 bottom-3 h-10 w-10 rounded-xl bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-indigo-700 active:scale-95"
							size="icon"
						>
							<Send className="h-5 w-5" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

// Email item in the feed (expandable)
interface EmailFeedItemProps {
	email: Email;
	isExpanded: boolean;
	onToggleExpand: () => void;
	onToggleStar: (emailId: string) => void;
	onToggleRead: (emailId: string) => void;
	onTagEmail: (emailId: string, tag: EmailTag) => void;
	onRemoveTag: (emailId: string, projectId: string, taskId?: string) => void;
	allProjects: Project[];
	formatDate: (date: Date) => string;
}

const EmailFeedItem: React.FC<EmailFeedItemProps> = ({
	email,
	isExpanded,
	onToggleExpand,
	onToggleStar,
	onToggleRead,
	onTagEmail,
	onRemoveTag,
	allProjects,
	formatDate,
}) => {
	return (
		<>
			{/* Icon */}
			<div
				className={cn(
					"absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm",
					email.isActionRequired
						? "border-amber-200 bg-amber-50 text-amber-600"
						: "border-indigo-200 bg-indigo-50 text-indigo-600",
				)}
			>
				<Mail className="h-3.5 w-3.5" />
			</div>

			{/* Header row */}
			<div className="mb-1 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"text-xs uppercase tracking-tighter",
							email.isRead
								? "font-semibold text-slate-600"
								: "font-black text-slate-800",
						)}
					>
						{email.from.name}
					</span>
					{!email.isRead && (
						<span className="h-2 w-2 rounded-full bg-indigo-500" />
					)}
					{email.isActionRequired && (
						<AlertCircle className="h-3.5 w-3.5 text-amber-500" />
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						className={cn(
							"transition-colors",
							email.isStarred
								? "text-amber-400"
								: "text-slate-300 hover:text-amber-400",
						)}
						onClick={(e) => {
							e.stopPropagation();
							onToggleStar(email.id);
						}}
						type="button"
					>
						<Star
							className={cn("h-3.5 w-3.5", email.isStarred && "fill-amber-400")}
						/>
					</button>
					<span className="font-medium text-[10px] text-slate-400">
						{formatDate(new Date(email.timestamp))}
					</span>
				</div>
			</div>

			{/* Expandable content */}
			<button
				className={cn(
					"w-full rounded-2xl border text-left shadow-sm transition-all",
					email.isActionRequired
						? "border-amber-200 bg-amber-50 ring-2 ring-amber-50"
						: "border-slate-100 bg-white hover:border-slate-200",
					!email.isRead && "ring-2 ring-indigo-100",
				)}
				onClick={() => {
					onToggleExpand();
					if (!email.isRead) onToggleRead(email.id);
				}}
				type="button"
			>
				{/* Collapsed view */}
				<div className="flex items-start gap-2 p-4">
					<div className="min-w-0 flex-1">
						{email.isActionRequired && (
							<div className="mb-1 flex items-center gap-1.5 font-black text-[9px] text-amber-600 uppercase tracking-widest">
								<Circle className="h-1.5 w-1.5 animate-pulse fill-amber-500 text-amber-500" />
								Action Required
							</div>
						)}
						<p
							className={cn(
								"mb-1 text-sm",
								email.isRead
									? "font-medium text-slate-700"
									: "font-semibold text-slate-900",
							)}
						>
							{email.subject}
						</p>
						{!isExpanded && (
							<p className="line-clamp-2 text-slate-500 text-xs">
								{email.preview}
							</p>
						)}
					</div>
					<div className="flex items-center gap-1 text-slate-400">
						{email.attachments.length > 0 && (
							<div className="flex items-center gap-0.5 text-slate-400">
								<Paperclip className="h-3 w-3" />
								<span className="text-[10px]">{email.attachments.length}</span>
							</div>
						)}
						{isExpanded ? (
							<ChevronDown className="h-4 w-4" />
						) : (
							<ChevronRight className="h-4 w-4" />
						)}
					</div>
				</div>

				{/* Expanded view */}
				{isExpanded && (
					<div className="border-slate-100 border-t px-4 pb-4">
						{/* Email headers */}
						<div className="mb-3 space-y-1 border-slate-100 border-b py-3 text-xs">
							<div className="flex gap-2">
								<span className="w-10 text-slate-400">To:</span>
								<span className="text-slate-600">{email.to.join(", ")}</span>
							</div>
							{email.cc && email.cc.length > 0 && (
								<div className="flex gap-2">
									<span className="w-10 text-slate-400">CC:</span>
									<span className="text-slate-600">{email.cc.join(", ")}</span>
								</div>
							)}
						</div>

						{/* Body */}
						<div className="mb-3 whitespace-pre-wrap font-medium text-slate-600 text-sm leading-relaxed">
							{email.body}
						</div>

						{/* Attachments */}
						{email.attachments.length > 0 && (
							<div className="mb-3 flex flex-wrap gap-2">
								{email.attachments.map((att) => (
									<div
										className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
										key={att.id}
									>
										<Paperclip className="h-3.5 w-3.5 text-slate-400" />
										<span className="font-medium text-slate-700 text-xs">
											{att.name}
										</span>
										{att.size && (
											<span className="text-[10px] text-slate-400">
												{att.size}
											</span>
										)}
									</div>
								))}
							</div>
						)}

						{/* Tags */}
						<div
							className="flex flex-wrap items-center gap-2 border-slate-100 border-t pt-3"
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							<Tag className="h-3 w-3 text-slate-400" />
							{email.tags.map((tag) => (
								<Badge
									className="group/tag h-5 gap-1 bg-indigo-100 pr-1 font-medium text-[10px] text-indigo-700"
									key={`${tag.projectId}-${tag.taskId || "project"}`}
									variant="secondary"
								>
									{tag.taskName || tag.projectName}
									<button
										className="ml-0.5 rounded p-0.5 opacity-60 transition-opacity hover:bg-indigo-200 hover:opacity-100"
										onClick={(e) => {
											e.stopPropagation();
											onRemoveTag(email.id, tag.projectId, tag.taskId);
										}}
										type="button"
									>
										<X className="h-2.5 w-2.5" />
									</button>
								</Badge>
							))}

							{/* Add tag dropdown */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										className="flex h-5 items-center gap-0.5 rounded border border-dashed border-slate-300 px-1.5 text-slate-400 transition-colors hover:border-indigo-400 hover:text-indigo-500"
										onClick={(e) => e.stopPropagation()}
										type="button"
									>
										<Plus className="h-3 w-3" />
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
									{allProjects.map((proj) => (
										<DropdownMenu key={proj.id}>
											<DropdownMenuTrigger className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-slate-100">
												<span>{proj.name}</span>
												<ChevronRight className="h-3.5 w-3.5 text-slate-400" />
											</DropdownMenuTrigger>
											<DropdownMenuContent className="w-48" side="right">
												<DropdownMenuItem
													onClick={() =>
														onTagEmail(email.id, {
															projectId: proj.id,
															projectName: proj.name,
														})
													}
												>
													Project only
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												{proj.tasks.map((task) => (
													<DropdownMenuItem
														key={task.id}
														onClick={() =>
															onTagEmail(email.id, {
																projectId: proj.id,
																projectName: proj.name,
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
				)}
			</button>
		</>
	);
};

// History item in the feed (files, status updates, comments)
interface HistoryFeedItemProps {
	item: ThreadItem;
	formatDate: (date: Date) => string;
}

const HistoryFeedItem: React.FC<HistoryFeedItemProps> = ({
	item,
	formatDate,
}) => {
	const getIcon = () => {
		switch (item.type) {
			case "file":
				return <FileText className="h-3.5 w-3.5" />;
			case "status":
				return <RefreshCw className="h-3.5 w-3.5" />;
			case "comment":
				return <MessageSquare className="h-3.5 w-3.5" />;
			default:
				return <FileText className="h-3.5 w-3.5" />;
		}
	};

	const getIconStyle = () => {
		switch (item.type) {
			case "file":
				return "border-blue-200 bg-blue-50 text-blue-600";
			case "status":
				return "border-emerald-200 bg-emerald-50 text-emerald-600";
			case "comment":
				return "border-slate-200 bg-slate-50 text-slate-500";
			default:
				return "border-slate-200 bg-slate-50 text-slate-400";
		}
	};

	return (
		<>
			{/* Icon */}
			<div
				className={cn(
					"absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm",
					getIconStyle(),
				)}
			>
				{getIcon()}
			</div>

			{/* Header */}
			<div className="mb-1 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="font-black text-slate-800 text-xs uppercase tracking-tighter">
						{item.sender}
					</span>
					{item.taskName && (
						<span className="rounded bg-slate-100 px-1.5 py-0.5 font-black text-[9px] text-slate-400 uppercase tracking-widest">
							{item.taskName}
						</span>
					)}
				</div>
				<span className="font-medium text-[10px] text-slate-400">
					{formatDate(new Date(item.timestamp))}
				</span>
			</div>

			{/* Content */}
			<div
				className={cn(
					"rounded-2xl border p-4 text-sm leading-relaxed shadow-sm",
					item.isActionRequired
						? "border-amber-200 bg-amber-50 ring-2 ring-amber-50"
						: "border-slate-100 bg-white",
				)}
			>
				{item.isActionRequired && (
					<div className="mb-2 flex items-center gap-1.5 font-black text-[9px] text-amber-600 uppercase tracking-widest">
						<Circle className="h-1.5 w-1.5 animate-pulse fill-amber-500 text-amber-500" />
						Action Required
					</div>
				)}
				<p className="whitespace-pre-wrap font-medium text-slate-600">
					{item.content}
				</p>

				{item.attachments && item.attachments.length > 0 && (
					<div className="mt-4 flex flex-wrap gap-2">
						{item.attachments.map((file) => (
							<div
								className="group flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition-all hover:bg-slate-100"
								key={`${item.id}-${file.name}`}
							>
								<Paperclip className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600" />
								<span className="font-bold text-[11px] text-slate-700">
									{file.name}
								</span>
								<span className="font-black text-[9px] text-slate-400 uppercase">
									{file.type}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</>
	);
};
