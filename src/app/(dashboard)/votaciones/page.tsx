"use client";

import { useEffect, useState } from "react";
import { PollCard } from "@/components/polls/PollCard";
import { PollsService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import {
    Vote, BarChart3, Info, Calendar,
    MessageSquare, ShieldCheck, Filter, Users
} from "lucide-react";
import { motion } from "framer-motion";
import { Poll } from "@/lib/types";

export default function VotacionesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [activePolls, setActivePolls] = useState<Poll[]>([]);
    const [closedPolls, setClosedPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadPolls();
        }
    }, [user]);

    const mapSupabasePoll = (pollData: any, userVotesArray: { poll_id: string; option_id: string }[]): Poll => {
        // Map raw supabase payload into frontend Poll format
        const totalVotes = pollData.votes?.length || 0;
        const optionsWithCounts = (pollData.options || []).map((opt: any) => {
            const votesForOption = (pollData.votes || []).filter((v: any) => v.option_id === opt.id).length;
            return {
                id: opt.id,
                text: opt.text,
                votes: votesForOption
            };
        });

        // Did the current user vote in this poll?
        const userVote = userVotesArray.find(v => v.poll_id === pollData.id);

        return {
            id: pollData.id,
            title: pollData.title,
            description: pollData.description,
            endDate: pollData.end_date,
            status: pollData.status,
            category: pollData.category,
            totalVotes: totalVotes,
            options: optionsWithCounts,
            createdAt: pollData.created_at,
            // Extensions for UI that are not in the base Poll interface
            ...({
                hasVotedInit: !!userVote,
                votedOptionId: userVote?.option_id || null
            } as any)
        } as Poll;
    };

    const loadPolls = async () => {
        setLoading(true);
        try {
            const [active, closed] = await Promise.all([
                PollsService.getActivePolls(),
                PollsService.getClosedPolls()
            ]);

            // To be precise for the UI, let's map them.
            // We fetch user vote statuses in parallel.
            const checkVotesPromises = [...(active || []), ...(closed || [])].map((p: any) =>
                PollsService.hasUserVoted(p.id, user!.id).then(res => ({ poll_id: p.id, vote: res as any }))
            );
            const userVotesResults = await Promise.all(checkVotesPromises);
            const validUserVotes = userVotesResults
                .filter(r => r.vote !== null)
                .map((r: any) => ({ poll_id: r.poll_id, option_id: r.vote!.option_id }));

            setActivePolls((active || []).map((p: any) => mapSupabasePoll(p, validUserVotes)));
            setClosedPolls((closed || []).map((p: any) => mapSupabasePoll(p, validUserVotes)));

        } catch (error: unknown) {
            console.error("Error loading polls:", error);
            setActivePolls([]);
            setClosedPolls([]);
        } finally {
            setLoading(false);
        }
    };

    const handleVote = async (pollId: string, optionId: string) => {
        if (!user) return;
        try {
            await PollsService.submitVote(pollId, optionId, user.id);
            await loadPolls();
        } catch (error: unknown) {
            console.error("Error voting:", error);
            const err = error as any;
            if (err.code === '23505') {
                toast({
                    title: "Ya has votado",
                    description: "Solo puedes emitir un voto por consulta.",
                    variant: "destructive"
                });
            } else {
                const errorMessage = error instanceof Error ? error.message : "Hubo un problema de conexión.";
                toast({
                    title: "Error al registrar el voto",
                    description: errorMessage,
                    variant: "destructive"
                });
            }
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center p-20 text-slate-500">Cargando consultas...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Participación Comunitaria</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Centro de Votación</h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <Users className="h-5 w-5 text-blue-500" />
                        <span className="text-sm font-black text-slate-900 dark:text-white">Participando</span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-700">
                    <ShieldCheck className="h-40 w-40 text-blue-400" />
                </div>
                <div className="relative z-10 max-w-2xl space-y-6">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-xs font-black uppercase tracking-widest text-blue-400">Democracia Digital</span>
                    </div>
                    <h2 className="text-3xl font-black leading-tight">Su opinión es fundamental para el desarrollo del condominio.</h2>
                    <p className="font-medium text-slate-400">
                        Todas las votaciones en ComunidadConnect son seguras. Los resultados finales se publican automáticamente al finalizar el período de consulta.
                    </p>
                </div>
            </div>

            <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                            <Vote className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Consultas Activas</h2>
                    </div>
                    <button className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-blue-500 transition-colors">
                        <Filter className="h-4 w-4" />
                        Filtrar
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {activePolls.map((poll) => (
                        <PollCard
                            key={poll.id}
                            poll={poll}
                            onVote={(optionId) => handleVote(poll.id, optionId)}
                            initialHasVoted={(poll as any).hasVotedInit}
                            initialSelectedOption={(poll as any).votedOptionId}
                        />
                    ))}
                    {activePolls.length === 0 && (
                        <div className="lg:col-span-2 text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-slate-500 font-bold">No hay consultas activas en este momento.</p>
                        </div>
                    )}
                </div>
            </div>

            {closedPolls.length > 0 && (
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500">
                            <BarChart3 className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Resultados Históricos</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {closedPolls.map((poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                initialHasVoted={(poll as any).hasVotedInit}
                                initialSelectedOption={(poll as any).votedOptionId}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
