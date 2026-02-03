import { Plus, Trash2, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
	type Checkpoint,
	type ComplianceTask,
	PermitStage,
	TaskType,
} from "@/types";

interface TaskControlMenuProps {
	task: ComplianceTask;
	onUpdateStatus: (status: any) => void;
	onToggleCheckpoint: (checkpointId: string) => void;
	onUpdateTaskSchema: (updates: Partial<ComplianceTask>) => void;
	onDeleteTask: () => void;
	onClose: () => void;
}

export const TaskControlMenu: React.FC<TaskControlMenuProps> = ({
	task,
	onUpdateStatus,
	onToggleCheckpoint,
	onUpdateTaskSchema,
	onDeleteTask,
	onClose,
}) => {
	const [newCheckpointLabel, setNewCheckpointLabel] = useState("");

	const handleAddCheckpoint = () => {
		if (!newCheckpointLabel.trim()) return;
		const newCp: Checkpoint = {
			id: Math.random().toString(36).substring(2, 11),
			label: newCheckpointLabel,
			isCompleted: false,
		};
		onUpdateTaskSchema({ checkpoints: [...task.checkpoints, newCp] });
		setNewCheckpointLabel("");
	};

	const handleRemoveCheckpoint = (id: string) => {
		onUpdateTaskSchema({
			checkpoints: task.checkpoints.filter((cp) => cp.id !== id),
		});
	};

	return (
		<div className="w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
			<Tabs className="w-full" defaultValue="status">
				<TabsList className="h-12 w-full rounded-none border-b bg-slate-50/50">
					<TabsTrigger
						className="flex-1 font-bold text-xs uppercase tracking-widest"
						value="status"
					>
						Status
					</TabsTrigger>
					<TabsTrigger
						className="flex-1 font-bold text-xs uppercase tracking-widest"
						value="config"
					>
						Configure
					</TabsTrigger>
				</TabsList>

				<div className="p-4">
					<TabsContent className="mt-0 space-y-4" value="status">
						<div className="space-y-1.5">
							<Label className="font-black text-[10px] text-slate-400 border-none uppercase tracking-tighter">
								Current Primary Action
							</Label>
							<Input
								className="h-9 rounded-lg border-slate-200 bg-slate-50 font-bold text-xs focus-visible:ring-indigo-500"
								onChange={(e) =>
									onUpdateTaskSchema({ primaryAction: e.target.value })
								}
								placeholder="e.g., Waiting on customer..."
								type="text"
								value={task.primaryAction || ""}
							/>
						</div>

						{task.type === TaskType.BINARY ? (
							<div className="space-y-1.5">
								<Label className="font-black text-[10px] text-slate-400 border-none uppercase tracking-tighter">
									Status
								</Label>
								<Button
									className={cn(
										"h-11 w-full rounded-xl border font-bold text-sm transition-all",
										task.status
											? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
											: "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
									)}
									onClick={() => onUpdateStatus(!task.status)}
									variant={task.status ? "default" : "outline"}
								>
									{task.status ? "Requirement Met" : "Mark as Complete"}
								</Button>
							</div>
						) : task.type === TaskType.STAGED ? (
							<div className="space-y-1.5">
								<Label className="font-black text-[10px] text-slate-400 border-none uppercase tracking-tighter">
									Workflow Stage
								</Label>
								<div className="flex flex-col gap-1.5">
									{[
										{ val: PermitStage.PREPARED, label: "Drafted / Prepared" },
										{
											val: PermitStage.FILED,
											label: "Filed / Sent to Customer",
										},
										{
											val: PermitStage.RECEIVED,
											label: "Received / Finalized",
										},
										{
											val: PermitStage.SENT_TO_BILLING,
											label: "Sent to Billing",
										},
										{ val: PermitStage.COMPLETED, label: "Active / Chilling" },
									].map((s) => (
										<Button
											className={cn(
												"h-8 justify-start px-3 font-bold text-[10px] uppercase tracking-wide transition-all",
												task.status === s.val
													? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700"
													: "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300",
											)}
											key={s.val}
											onClick={() => onUpdateStatus(s.val)}
											size="sm"
											variant={task.status === s.val ? "default" : "outline"}
										>
											<div
												className={cn(
													"w-4 h-4 rounded-full border mr-2 flex items-center justify-center text-[8px]",
													task.status === s.val
														? "bg-white text-indigo-600"
														: "bg-slate-200 text-slate-400",
												)}
											>
												{s.val}
											</div>
											{s.label}
										</Button>
									))}
									<Button
										className="h-8 bg-slate-100 font-bold text-[9px] text-slate-400 hover:bg-slate-200"
										onClick={() => onUpdateStatus(PermitStage.NOT_STARTED)}
										size="sm"
										variant="ghost"
									>
										Reset to Not Started
									</Button>
								</div>
							</div>
						) : (
							<div className="space-y-1.5">
								<Label className="font-black text-[10px] text-slate-400 border-none uppercase tracking-tighter">
									Narrative Status
								</Label>
								<Textarea
									className="min-h-[80px] w-full rounded-xl border-slate-200 bg-slate-50 text-xs focus-visible:ring-indigo-500"
									onChange={(e) => onUpdateStatus(e.target.value)}
									placeholder="Update narrative..."
									value={task.status as string}
								/>
							</div>
						)}

						{task.checkpoints.length > 0 && (
							<div className="border-t pt-3">
								<Label className="mb-2 block font-black text-[10px] text-slate-400 uppercase tracking-tighter">
									Checkpoints
								</Label>
								<ScrollArea className="h-40 pr-3">
									<div className="space-y-2">
										{task.checkpoints.map((cp) => (
											<div
												className="group flex items-center space-x-2 rounded-lg bg-slate-50/50 p-2 transition-colors hover:bg-slate-100"
												key={cp.id}
											>
												<Checkbox
													checked={cp.isCompleted}
													className="h-4 w-4 border-slate-300 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
													id={cp.id}
													onCheckedChange={() => onToggleCheckpoint(cp.id)}
												/>
												<label
													className={cn(
														"cursor-pointer font-semibold text-[11px] leading-none transition-colors peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
														cp.isCompleted
															? "text-slate-400 line-through"
															: "text-slate-700",
													)}
													htmlFor={cp.id}
												>
													{cp.label}
												</label>
											</div>
										))}
									</div>
								</ScrollArea>
							</div>
						)}
					</TabsContent>

					<TabsContent className="mt-0 space-y-4" value="config">
						<div className="space-y-1.5">
							<Label className="font-black text-[10px] text-slate-400 uppercase">
								Requirement Name
							</Label>
							<Input
								className="h-9 rounded-lg border-slate-200 bg-slate-50 font-bold text-xs focus-visible:ring-indigo-500"
								onChange={(e) => onUpdateTaskSchema({ name: e.target.value })}
								type="text"
								value={task.name}
							/>
						</div>

						<div className="space-y-1.5">
							<Label className="font-black text-[10px] text-slate-400 uppercase">
								Type
							</Label>
							<Select
								onValueChange={(value) =>
									onUpdateTaskSchema({ type: value as TaskType })
								}
								value={task.type}
							>
								<SelectTrigger className="h-9 rounded-lg border-slate-200 bg-slate-50 font-medium text-xs">
									<SelectValue placeholder="Select type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={TaskType.BINARY}>Yes/No Toggle</SelectItem>
									<SelectItem value={TaskType.STAGED}>
										5-Stage Workflow
									</SelectItem>
									<SelectItem value={TaskType.NARRATIVE}>
										Text Narrative
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label className="font-black text-[10px] text-slate-400 uppercase">
								Edit Checkpoints
							</Label>
							<ScrollArea className="mb-2 h-28 pr-3">
								<div className="space-y-2">
									{task.checkpoints.map((cp) => (
										<div
											className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 p-1.5 font-medium text-[10px] text-slate-600"
											key={cp.id}
										>
											<span className="flex-1 truncate">{cp.label}</span>
											<Button
												className="h-4 w-4 hover:text-red-500"
												onClick={() => handleRemoveCheckpoint(cp.id)}
												size="icon"
												variant="ghost"
											>
												<X className="h-3 w-3" />
											</Button>
										</div>
									))}
								</div>
							</ScrollArea>
							<div className="flex gap-1">
								<Input
									className="h-8 flex-1 rounded-lg border-slate-200 bg-slate-50 text-[10px] focus-visible:ring-indigo-500"
									onChange={(e) => setNewCheckpointLabel(e.target.value)}
									placeholder="New step..."
									type="text"
									value={newCheckpointLabel}
								/>
								<Button
									className="h-8 rounded-lg bg-indigo-600 px-3 font-bold text-white text-xs hover:bg-indigo-700"
									onClick={handleAddCheckpoint}
								>
									<Plus className="h-3 w-3" />
								</Button>
							</div>
						</div>

						<div className="flex gap-2 border-t pt-2">
							<Button
								className="h-9 flex-1 border-none bg-red-50 font-bold text-[10px] text-red-600 hover:bg-red-100"
								onClick={onDeleteTask}
								size="sm"
								variant="destructive"
							>
								<Trash2 className="mr-1 h-3 w-3" />
								Delete
							</Button>
							<Button
								className="h-9 flex-1 bg-slate-900 font-bold text-[10px] text-white hover:bg-slate-800"
								onClick={onClose}
								size="sm"
							>
								Done
							</Button>
						</div>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
};
