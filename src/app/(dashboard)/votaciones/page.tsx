"use client";

import { useEffect, useMemo, useState } from "react";
import { PollCard } from "@/components/polls/PollCard";
import { PollsService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { BarChart3, CalendarDays, CheckCircle2, Download, Users, Vote } from "lucide-react";
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

    const downloadAssemblyDocument = (name: string) => {
        const content = [
            "Convive Connect - Respaldo de votacion comunitaria",
            "",
            `Documento: ${name}`,
            "Consulta: Construccion quincho de tejas",
            "Estado: Asamblea en vivo",
            "Resumen: Debate sobre ampliacion del area recreativa en terraza Torre A.",
            "",
            "Este archivo reemplaza el adjunto operativo mientras se carga el PDF legal definitivo desde administracion.",
        ].join("\n");
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name.replace(/\.pdf$/i, ".txt");
        anchor.click();
        URL.revokeObjectURL(url);
    };

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
                const errorMessage = error instanceof Error ? error.message : "Hubo un problema de conexión.";
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
                    <Eyebrow>Participación comunitaria</Eyebrow>
                    <DisplayHeading size={36} className="mt-2">
                        Centro de <em className="text-italic-serif text-brand-600">votación</em>
                    </DisplayHeading>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Revisa las consultas abiertas de tu comunidad, emite tu voto y consulta resultados históricos de forma ordenada.
                    </p>
                </div>
                <div className="rounded-xl border border-subtle bg-surface p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Estado actual</p>
                    <div className="mt-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-brand-600 animate-pulse" />
                        <span className="text-sm font-semibold cc-text-primary">{stats.pendingVotes} votación(es) pendientes</span>
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
                            Propuesta activa: <em className="text-italic-serif text-brand-300">Construcción quincho de tejas</em>
                        </h2>
                        <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                            Debate en curso sobre la ampliación del área recreativa en la terraza de la Torre A. Por favor revise el quórum y los adjuntos.
                        </p>
                        
                        {/* Pros & Cons layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-2xl">
                            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
                                <p className="font-bold mb-1">Pros:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Incrementa plusvalía del edificio</li>
                                    <li>Sombra garantizada en temporada alta</li>
                                </ul>
                            </div>
                            <div className="bg-rose-950/40 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300">
                                <p className="font-bold mb-1">Contras:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Costo de mantención del techo de tejas</li>
                                    <li>Ruido acústico leve para departamentos superiores</li>
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
                                <button
                                    key={doc}
                                    type="button"
                                    onClick={() => downloadAssemblyDocument(doc)}
                                    className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2.5 text-left text-xs transition-all hover:bg-white/10"
                                >
                                    <span className="truncate text-slate-300 font-medium">{doc}</span>
                                    <span className="ml-2 inline-flex items-center gap-1 text-brand-300">
                                        <Download className="h-3.5 w-3.5" />
                                        Descargar
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
                <MetricCard icon={<Vote className="h-5 w-5" />} label="Consultas activas" value={activePolls.length} helper="Disponibles para votar" />
                <MetricCard icon={<Users className="h-5 w-5" />} label="Votos activos" value={stats.totalActiveVotes} helper="Participación registrada" />
                <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Cierran pronto" value={stats.closingSoon} helper="En los próximos 3 días" dark />
            </section>

            <section className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold cc-text-primary">Consultas activas</h2>
                        <p className="mt-1 text-sm cc-text-secondary">Selecciona una opción y confirma tu voto.</p>
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
                            Resultados históricos
                        </h2>
                        <p className="mt-1 text-sm cc-text-secondary">Consultas cerradas y participación agregada.</p>
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
