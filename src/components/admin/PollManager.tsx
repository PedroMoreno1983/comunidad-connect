"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
    Plus, BarChart3, Clock, Settings,
    MoreHorizontal, Filter, Search,
    MessageSquare, AlertCircle, CheckCircle2,
    Calendar, Vote
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Poll } from "@/lib/types";
import { MOCK_POLLS } from "@/lib/mockData";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

export function PollManager() {
    const [polls, setPolls] = useState<Poll[]>(MOCK_POLLS);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newPoll, setNewPoll] = useState({ title: "", description: "", category: "community" });
    const { toast } = useToast();

    const handleCreatePoll = (e: React.FormEvent) => {
        e.preventDefault();
        const poll: Poll = {
            id: Math.random().toString(36).substr(2, 9),
            title: newPoll.title,
            description: newPoll.description,
            category: newPoll.category as any,
            status: 'active',
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            totalVotes: 0,
            options: [
                { id: '1', text: 'Opción A', votes: 0 },
                { id: '2', text: 'Opción B', votes: 0 }
            ]
        };
        setPolls([poll, ...polls]);
        setIsDialogOpen(false);
        setNewPoll({ title: "", description: "", category: "community" });
        toast({
            title: "Votación Publicada",
            description: "La consulta ya está disponible para todos los residentes.",
            variant: "success"
        });
    };

    return (
        <div className="space-y-12">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                            <Vote className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white">Consultas Activas</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">
                        {polls.filter(p => p.status === 'active').length}
                    </p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-emerald-500">Participación 68%</p>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl">
                            <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white">Cierran Pronto</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">2</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">En las próximas 48 horas</p>
                </div>

                <div className="bg-slate-900/80 dark:bg-slate-950/80 backdrop-blur-xl border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl shadow-blue-500/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <BarChart3 className="h-20 w-20 text-blue-500" />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="mb-6">
                            <h3 className="font-black text-white">Quórum Alcanzado</h3>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Promedio Trimestral</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-sm font-bold text-slate-300">Decisiones Legales</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Management Section */}
            <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                            <Settings className="h-6 w-6 text-slate-900 dark:text-white" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Gestor de Consultas</h2>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl active:scale-95">
                                <Plus className="h-5 w-5" />
                                Nueva Votación
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[550px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black">Crear Consulta Formal</DialogTitle>
                                <DialogDescription className="font-medium">
                                    Defina la propuesta para ser votada por la comunidad.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreatePoll} className="space-y-6 pt-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Título de la Propuesta</label>
                                    <Input
                                        placeholder="Ej: Renovación de Ascensores 2026"
                                        className="h-14 rounded-2xl font-bold"
                                        required
                                        value={newPoll.title}
                                        onChange={(e) => setNewPoll({ ...newPoll, title: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Categoría</label>
                                    <select
                                        className="w-full h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
                                        value={newPoll.category}
                                        onChange={(e) => setNewPoll({ ...newPoll, category: e.target.value })}
                                    >
                                        <option value="community">Comunidad & Eventos</option>
                                        <option value="maintenance">Mantención & Obras</option>
                                        <option value="rules">Reglamento & Normas</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Descripción / Contexto</label>
                                    <textarea
                                        className="w-full h-32 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                                        placeholder="Detalle los beneficios y costos de la propuesta..."
                                        required
                                        value={newPoll.description}
                                        onChange={(e) => setNewPoll({ ...newPoll, description: e.target.value })}
                                    />
                                </div>
                                <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex gap-3 border border-amber-100 dark:border-amber-500/20">
                                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                                    <p className="text-[11px] font-medium text-amber-700 leading-relaxed">
                                        Las consultas publicadas como **Mantenimiento** o **Reglamento** requieren un quórum legal mínimo del **60%** según la ley vigente.
                                    </p>
                                </div>
                                <DialogFooter className="pt-4">
                                    <Button type="submit" className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-lg shadow-xl shadow-blue-500/20 transition-all">
                                        Publicar Votación
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Table Section */}
                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-[3rem] border border-white/50 dark:border-slate-700/50 overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-50 dark:border-slate-800">
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Votación</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Participación</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Vence en</th>
                                    <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {polls.map((poll) => (
                                    <tr key={poll.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-4">
                                                <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold ${poll.category === 'maintenance' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                                                    }`}>
                                                    <Vote className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-900 dark:text-white leading-none mb-1">{poll.title}</p>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID: {poll.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-sm font-black text-slate-900 dark:text-white">{poll.totalVotes}</span>
                                                    <span className="text-[10px] font-black text-slate-400">Objetivo: 80</span>
                                                </div>
                                                <div className="h-1.5 w-32 bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 rounded-full"
                                                        style={{ width: `${Math.min(100, (poll.totalVotes / 80) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${poll.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                                : 'bg-slate-50 text-slate-400'
                                                }`}>
                                                {poll.status === 'active' ? "Activa" : "Cerrada"}
                                            </span>
                                        </td>
                                        <td className="px-10 py-8 text-sm font-bold text-slate-600 dark:text-slate-400">
                                            {Math.max(0, Math.ceil((new Date(poll.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} días
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <button className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                                                <MoreHorizontal className="h-5 w-5 text-slate-400" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
