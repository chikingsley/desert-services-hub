import { FileText, Mail, Plus } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ComplianceTask, Project } from "@/types";
import { TaskChip } from "./TaskChip";
import { TaskControlMenu } from "./TaskControlMenu";

interface ProjectCardProps {
	project: Project;
	isActive: boolean;
	hasCriticalAction: boolean;
	activeTaskMenu: { projectId: string; taskId: string } | null;
	focusedTaskID: string | null;
	focusedProjectID: string;
	emailCount?: number;
	onProjectClick: () => void;
	onTaskClick: (taskId: string) => void;
	onAddTask: () => void;
	onUpdateTask: (taskId: string, status: any) => void;
	onUpdateTaskSchema: (
		taskId: string,
		updates: Partial<ComplianceTask>,
	) => void;
	onToggleCheckpoint: (taskId: string, checkpointId: string) => void;
	onDeleteTask: (taskId: string) => void;
	onCloseMenu: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
	project,
	isActive,
	hasCriticalAction,
	activeTaskMenu,
	focusedTaskID,
	focusedProjectID,
	emailCount = 0,
	onProjectClick,
	onTaskClick,
	onAddTask,
	onUpdateTask,
	onUpdateTaskSchema,
	onToggleCheckpoint,
	onDeleteTask,
	onCloseMenu,
}) => {
	return (
		<Card
			className={cn(
				"relative cursor-pointer rounded-3xl border p-6 transition-all",
				isActive
					? "border-indigo-600 shadow-md ring-4 ring-indigo-50"
					: hasCriticalAction
						? "border-amber-200 ring-4 ring-amber-50/50"
						: "border-slate-200 hover:shadow-lg",
			)}
			onClick={onProjectClick}
		>
			<div className="flex flex-col items-start gap-8 md:flex-row">
				<div className="w-full flex-shrink-0 md:w-64">
					<div className="mb-2 flex items-center gap-3">
						<Badge
							className="border-none bg-slate-100 font-black text-[10px] text-slate-500 uppercase tracking-widest"
							variant="secondary"
						>
							{project.id}
						</Badge>
						<Badge
							className="border-indigo-100 bg-indigo-50 font-black text-[10px] text-indigo-700 uppercase tracking-widest"
							variant="outline"
						>
							{project.stage}
						</Badge>
					</div>
					<h3 className="mb-1 font-black text-lg text-slate-900 leading-tight">
						{project.name}
					</h3>
					<p className="font-semibold text-slate-500 text-sm">
						{project.client}
					</p>
					<div className="mt-4 flex items-center justify-between border-slate-100 border-t pt-4">
						<div className="flex items-center gap-2 font-black text-[10px] text-slate-400 uppercase tracking-widest">
							<FileText className="h-3 w-3" /> {project.contractNumber}
						</div>
						{emailCount > 0 && (
							<div className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-[10px] text-indigo-700">
								<Mail className="h-3 w-3" />
								{emailCount}
							</div>
						)}
					</div>
				</div>

				<div className="relative z-20 flex flex-1 flex-wrap gap-3 pt-1">
					{project.tasks.map((task) => {
						const taskNeedsAction = task.history.some(
							(h) => h.isActionRequired,
						);
						const isSidebarFocused =
							focusedTaskID === task.id && focusedProjectID === project.id;
						const isMenuActive = activeTaskMenu?.taskId === task.id;

						return (
							<div key={task.id} onClick={(e) => e.stopPropagation()}>
								<Popover
									onOpenChange={(open) => {
										if (open) {
											onTaskClick(task.id);
										} else if (isMenuActive) {
											onCloseMenu();
										}
									}}
									open={isMenuActive}
								>
									<PopoverTrigger asChild>
										<div
											className={cn(
												"cursor-pointer transition-all",
												taskNeedsAction
													? "animate-pulse rounded-xl p-0.5 ring-2 ring-amber-400"
													: "",
												isSidebarFocused
													? "rounded-xl p-0.5 shadow-indigo-100 ring-2 ring-indigo-600"
													: "",
											)}
										>
											<TaskChip onClick={() => {}} task={task} />
										</div>
									</PopoverTrigger>
									<PopoverContent
										align="start"
										className="w-auto p-0 border-none shadow-none bg-transparent overflow-visible z-[1000]"
										side="bottom"
										sideOffset={8}
									>
										<TaskControlMenu
											onClose={onCloseMenu}
											onDeleteTask={() => onDeleteTask(task.id)}
											onToggleCheckpoint={(cpId) =>
												onToggleCheckpoint(task.id, cpId)
											}
											onUpdateStatus={(s) => onUpdateTask(task.id, s)}
											onUpdateTaskSchema={(upd) =>
												onUpdateTaskSchema(task.id, upd)
											}
											task={task}
										/>
									</PopoverContent>
								</Popover>
							</div>
						);
					})}
					<Button
						className="h-10 w-10 rounded-2xl border-2 border-slate-200 border-dashed bg-slate-50/50 p-0 text-slate-400 transition-all hover:border-indigo-400 hover:text-indigo-500"
						onClick={(e) => {
							e.stopPropagation();
							onAddTask();
						}}
						variant="outline"
					>
						<Plus className="h-5 w-5" />
					</Button>
				</div>
			</div>
		</Card>
	);
};
