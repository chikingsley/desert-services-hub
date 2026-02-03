import { Search } from "lucide-react";
import type React from "react";
import { Input } from "@/components/ui/input";

interface HeaderProps {
	searchTerm: string;
	setSearchTerm: (value: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
	searchTerm,
	setSearchTerm,
}) => {
	return (
		<header className="z-30 flex items-center justify-between border-slate-200 border-b bg-white px-8 py-5 shadow-sm">
			<div>
				<h1 className="font-black text-slate-900 text-xl uppercase tracking-tight">
					Compliance Tracker
				</h1>
				<p className="font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">
					Project Controls Environment
				</p>
			</div>
			<div className="relative w-80">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
				<Input
					className="h-10 rounded-full border-slate-200 bg-slate-50 py-2 pr-4 pl-10 font-medium text-sm transition-all focus-visible:ring-indigo-500"
					onChange={(e) => setSearchTerm(e.target.value)}
					placeholder="Search projects or documents..."
					type="text"
					value={searchTerm}
				/>
			</div>
		</header>
	);
};
