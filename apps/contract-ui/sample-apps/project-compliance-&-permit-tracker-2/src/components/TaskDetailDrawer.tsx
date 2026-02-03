import { Circle, Clock, FileText, Mail, Paperclip, Send } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ComplianceTask } from "@/types";

interface TaskDetailDrawerProps {
	task: ComplianceTask;
	projectName: string;
	onClose: () => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({ task }) => {
	const [replyText, setReplyText] = useState("");

	return (
		<div className="flex h-full flex-col bg-white">
			{/* Thread Content */}
			<ScrollArea className="flex-1">
				<div className="space-y-8 bg-[#fdfdfe] p-6">
					{task.history.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center py-20 text-center opacity-40">
							<Clock className="mb-4 h-12 w-12 text-slate-300" />
							<p className="font-bold text-slate-500 text-xs uppercase tracking-widest">
								No activity for this selection
							</p>
						</div>
					) : (
						task.history.map((item, index) => (
							<div className="relative pl-8" key={item.id}>
								{/* Vertical line connector */}
								{index < task.history.length - 1 && (
									<div className="absolute top-8 bottom-0 left-3.5 w-px bg-slate-100" />
								)}

								<div
									className={cn(
										"absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm",
										item.type === "email"
											? "border-amber-200 bg-amber-50 text-amber-600"
											: item.type === "file"
												? "border-blue-200 bg-blue-50 text-blue-600"
												: "border-slate-200 bg-slate-50 text-slate-400",
									)}
								>
									{item.type === "email" ? (
										<Mail className="h-3.5 w-3.5" />
									) : (
										<FileText className="h-3.5 w-3.5" />
									)}
								</div>

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
										{item.timestamp}
									</span>
								</div>

								<div
									className={cn(
										"rounded-2xl border p-4 text-sm leading-relaxed shadow-sm",
										item.isActionRequired
											? "border-amber-200 bg-amber-50 ring-4 ring-amber-50/50"
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
													key={`${item.id}-${file.name}`}
													className="group flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition-all hover:bg-slate-100"
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
							</div>
						))
					)}
				</div>
			</ScrollArea>

			{/* Quick Reply / Interact */}
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
							className="min-h-[100px] w-full resize-none rounded-2xl border-slate-200 bg-slate-50 p-4 text-sm transition-all focus-visible:ring-indigo-500"
							onChange={(e) => setReplyText(e.target.value)}
							placeholder={
								task.id === "all"
									? "Select a task or project to message..."
									: `Reply to ${task.name}...`
							}
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
