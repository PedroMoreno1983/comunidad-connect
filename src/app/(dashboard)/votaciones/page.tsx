"use client";

import { useEffect, useMemo, useState } from "react";
import { PollCard } from "@/components/polls/PollCard";
import { PollsService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { BarChart3, CalendarDays, CheckCircle2, Users, Vote } from "lucide-react";
import type { PollVoteRecord, PollWithVoteState, SupabasePollRow } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";

export default function VotacionesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [activePolls, setActivePolls] = useState<PollWithVoteState[]>([]);
    const [closedPolls, setClosedPolls] = useState<PollWithVoteState[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) loadPolls();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const stats = useMemo(() => {
        const totalActiveVotes = activePolls.reduce((sum, poll) => sum + poll.totalVotes, 0);
        const pendingVotes = activePolls.filter(poll => !poll.hasVotedInit).length;
        const closingSoon = activePolls.filter(poll => {
            const daysLeft = Math.ceil((new Date(poll.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysLeft <= 3;
        }).length;
        return { totalActiveVotes, pendingVotes, closingSoon };
    }, [activePolls]);

    const normalizeStatus = (status?: string | null): PollWithVoteState["status"] =>
        status === "closed" ? "closed" : "active";

    const normalizeCategory = (category?: string | null): PollWithVoteState["category"] => {
        if (category === "maintenance" || category === "rules" || category === "other") return category;
        return "community";
    };

    const mapSupabasePoll = (pollData: SupabasePollRow, userVotesArray: PollVoteRecord[]): PollWithVoteState => {
        const totalVotes = pollData.votes?.length || 0;
        const rawOptions = pollData.options || pollData.poll_options || [];
        const optionsWithCounts = rawOptions.map((opt) => {
            const votesForOption = (pollData.votes || []).filter((v) => v.option_id === opt.id).length;
            return {
                id: opt.id,
                text: opt.text || opt.label || "Opcion",
                votes: votesForOption,
            };
        });
        const userVote = userVotesArray.find(v => v.poll_id === pollData.id);

        return {
            id: pollData.id,
            title: pollData.title,
            description: pollData.description || "",
            endDate: pollData.end_date || new Date().toISOString(),
            status: normalizeStatus(pollData.status),
            category: normalizeCategory(pollData.category),
            totalVotes,
            options: optionsWithCounts,
            createdAt: pollData.created_at || new Date().toISOString(),
            hasVotedInit: Boolean(userVote),
            votedOptionId: userVote?.option_id || null,
        };
    };

    const loadPolls = async () => {
        setLoading(true);
        try {
            const [active, closed] = await Promise.all([
                PollsService.getActivePolls(),
                PollsService.getClosedPolls(),
            ]);

            const activeRows = (active || []) as SupabasePollRow[];
            const closedRows = (closed || []) as SupabasePollRow[];
            const checkVotesPromises = [...activeRows, ...closedRows].map((poll) =>
                PollsService.hasUserVoted(poll.id, user!.id).then(res => ({
                    poll_id: poll.id,
                    vote: res as { option_id?: string } | null,
                }))
            );
            const userVotesResults = await Promise.all(checkVotesPromises);
            const validUserVotes: PollVoteRecord[] = userVotesResults
                .filter((result): result is { poll_id: string; vote: { option_id: string } } => Boolean(result.vote?.option_id))
                .map((result) => ({ poll_id: result.poll_id, option_id: result.vote.option_id }));

            setActivePolls(activeRows.map((poll) => mapSupabasePoll(poll, validUserVotes)));
            setClosedPolls(closedRows.map((poll) => mapSupabasePoll(poll, validUserVotes)));
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
            const errorCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
            if (errorCode === "23505") {
                toast({ title: "Ya has votado", description: "Solo puedes emitir un voto por consulta.", variant: "destructive" });
            } else {
                const errorMessage = error instanceof Error ? error.message : "Hubo un problema de conexiÃ³n.";
                toast({ title: "Error al registrar el voto", description: errorMessage, variant: "destructive" });
            }
            throw error;
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center p-20 text-sm cc-text-secondary">Cargando consultas...</div>;
    }

    return (
        <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
            <header className="flex flex-col justify-between gap-5 border-b border-subtle pb-6 lg:flex-row lg:items-end">
                <div>
                    <Eyebrow>ParticipaciÃ³n comunitaria</Eyebrow>
                    <DisplayHeading size={36} className="mt-2">
                        Centro de <em className="text-italic-serif text-brand-600">votaciÃ³n</em>
                    </DisplayHeading>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Revisa las consultas abiertas de tu comunidad, emite tu voto y consulta resultados histÃ³ricos de forma ordenada.
                    </p>
                </div>
                <div className="rounded-xl border border-subtle bg-surface p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Estado actual</p>
                    <div className="mt-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-brand-600 animate-pulse" />
                        <span className="text-sm font-semibold cc-text-primary">{stats.pendingVotes} votaciÃ³n(es) pendientes</span>
                    </div>
                </div>
            </header>

            {/* Live Assembly Panel Widget */}
            <div className="rounded-xl border border-transparent bg-slate-950 p-6 text-white shadow-lg overflow-hidden relative">
                <div className="absolute right-0 top-0 h-40 w-40 bg-radial-gradient from-brand-500/20 to-transparent pointer-events-none" />
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3">
                            <Tag tone="rose" dot={true} solid>Asamblea en Vivo</Tag>
                            <span className="font-mono text-sm tracking-wider text-rose-300 animate-pulse">04:32</span>
                        </div>
                        <h2 className="text-2xl font-semibold leading-tight">
                            Propuesta activa: <em className="text-italic-serif text-brand-300">ConstrucciÃ³n quincho de tejas</em>
                        </h2>
                        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                            Debate en curso sobre la ampliaciÃ³n del Ã¡rea recreativa en la terraza de la Torre A. Por favor revise el quÃ³rum y los adjuntos.
                        </p>
                        
                        {/* Pros & Cons layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-2xl">
                            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
                                <p className="font-bold mb-1">Pros:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Incrementa plusvalÃ­a del edificio</li>
                                    <li>Sombra garantizada en temporada alta</li>
                                </ul>
                            </div>
                            <div className="bg-rose-950/40 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300">
                                <p className="font-bold mb-1">Contras:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Costo de mantenciÃ³n del techo de tejas</li>
                                    <li>Ruido acÃºstico leve para departamentos superiores</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-3 shrink-0 lg:max-w-xs w-full lg:w-auto">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Documentos adjuntos</p>
                        <div className="space-y-2">
                            {[
                                "Especificaciones_Tecnicas.pdf",
                                "Presupuesto_Quincho_V1.pdf"
                            ].map(doc => (
                                <a key={doc} href="#" className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs transition-all">
                                    <span className="truncate text-slate-300 font-medium">{doc}</span>
                                    <span className="text-brand-300 ml-2">Descargar</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
                <MetricCard icon={<Vote className="h-5 w-5" />} label="Consultas activas" value={activePolls.length} helper="Disponibles para votar" />
                <MetricCard icon={<Users className="h-5 w-5" />} label="Votos activos" value={stats.totalActiveVotes} helper="ParticipaciÃ³n registrada" />
                <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Cierran pronto" value={stats.closingSoon} helper="En los prÃ³ximos 3 dÃ­as" dark />
            </section>

            <section className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold cc-text-primary">Consultas activas</h2>
                        <p className="mt-1 text-sm cc-text-secondary">Selecciona una opciÃ³n y confirma tu voto.</p>
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    {activePolls.map((poll) => (
                        <PollCard
                            key={poll.id}
                            poll={poll}
                            onVote={(optionId) => handleVote(poll.id, optionId)}
                            initialHasVoted={poll.hasVotedInit}
                            initialSelectedOption={poll.votedOptionId}
                        />
                    ))}
                    {activePolls.length === 0 && (
                        <div className="lg:col-span-2">
                            <EmptyState
                                icon={<Vote className="h-6 w-6" />}
                                title="Sin consultas activas"
                                description="No hay votaciones o consultas comunitarias activas en este momento."
                            />
                        </div>
                    )}
                </div>
            </section>

            {closedPolls.length > 0 && (
                <section className="space-y-5">
                    <div>
                        <h2 className="flex items-center gap-2 text-xl font-bold cc-text-primary">
                            <BarChart3 className="h-5 w-5 cc-text-secondary" />
                            Resultados histÃ³ricos
                        </h2>
                        <p className="mt-1 text-sm cc-text-secondary">Consultas cerradas y participaciÃ³n agregada.</p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {closedPolls.map((poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                initialHasVoted={poll.hasVotedInit}
                                initialSelectedOption={poll.votedOptionId}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function MetricCard({ icon, label, value, helper, dark = false }: { icon: React.ReactNode; label: string; value: number; helper: string; dark?: boolean }) {
    return (
        <article className={`rounded-xl border p-5 shadow-sm ${dark ? "border-slate-900 bg-slate-950 text-white" : "border-subtle bg-surface"}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${dark ? "bg-white/10 text-brand-300" : "bg-brand-50 text-brand-600"}`}>
                {icon}
            </div>
            <p className={`mt-5 text-3xl font-semibold ${dark ? "text-white" : "cc-text-primary"}`}>{value}</p>
            <p className={`mt-1 text-xs font-bold uppercase tracking-[0.12em] ${dark ? "text-slate-400" : "cc-text-secondary"}`}>{label}</p>
            <p className={`mt-2 text-sm ${dark ? "text-slate-300" : "cc-text-secondary"}`}>{helper}</p>
        </article>
    );
}
