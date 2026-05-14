"use client";

import { useEffect, useMemo, useState } from "react";
import { PollCard } from "@/components/polls/PollCard";
import { PollsService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { BarChart3, CalendarDays, CheckCircle2, ShieldCheck, Users, Vote } from "lucide-react";
import { Poll } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";

const demoStorageKey = "cc_demo_admin_polls";

const demoActivePolls: Poll[] = [
    {
        id: "demo-poll-1",
        title: "Renovar luminarias del estacionamiento",
        description: "Cambio a luminarias LED con sensor de movimiento para bajar consumo y mejorar seguridad.",
        options: [{ id: "yes", text: "A favor", votes: 42 }, { id: "no", text: "En contra", votes: 8 }],
        endDate: "2026-05-20",
        totalVotes: 50,
        status: "active",
        category: "maintenance",
        createdAt: "2026-05-01",
    },
];

const demoClosedPolls: Poll[] = [
    {
        id: "demo-poll-2",
        title: "Horario de piscina temporada verano",
        description: "Resultado historico de consulta comunitaria.",
        options: [{ id: "a", text: "10:00 a 20:00", votes: 66 }, { id: "b", text: "09:00 a 21:00", votes: 31 }],
        endDate: "2026-03-30",
        totalVotes: 97,
        status: "closed",
        category: "community",
        createdAt: "2026-03-10",
    },
];

function loadDemoPublishedPolls() {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(window.localStorage.getItem(demoStorageKey) || "[]") as Poll[];
    } catch {
        return [];
    }
}

function saveDemoPublishedPolls(polls: Poll[]) {
    if (typeof window === "undefined") return;
    const published = polls.filter(poll => poll.id.startsWith("demo-admin-poll-"));
    window.localStorage.setItem(demoStorageKey, JSON.stringify(published.slice(0, 20)));
}

export default function VotacionesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [activePolls, setActivePolls] = useState<Poll[]>([]);
    const [closedPolls, setClosedPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) loadPolls();
        // Polls are refreshed when the authenticated user identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const stats = useMemo(() => {
        const totalActiveVotes = activePolls.reduce((sum, poll) => sum + poll.totalVotes, 0);
        const pendingVotes = activePolls.filter(poll => !(poll as any).hasVotedInit).length;
        const closingSoon = activePolls.filter(poll => {
            const daysLeft = Math.ceil((new Date(poll.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysLeft <= 3;
        }).length;
        return { totalActiveVotes, pendingVotes, closingSoon };
    }, [activePolls]);

    const mapSupabasePoll = (pollData: any, userVotesArray: { poll_id: string; option_id: string }[]): Poll => {
        const totalVotes = pollData.votes?.length || 0;
        const optionsWithCounts = (pollData.options || []).map((opt: any) => {
            const votesForOption = (pollData.votes || []).filter((v: any) => v.option_id === opt.id).length;
            return {
                id: opt.id,
                text: opt.text,
                votes: votesForOption,
            };
        });
        const userVote = userVotesArray.find(v => v.poll_id === pollData.id);

        return {
            id: pollData.id,
            title: pollData.title,
            description: pollData.description,
            endDate: pollData.end_date,
            status: pollData.status,
            category: pollData.category,
            totalVotes,
            options: optionsWithCounts,
            createdAt: pollData.created_at,
            ...({
                hasVotedInit: !!userVote,
                votedOptionId: userVote?.option_id || null,
            } as any),
        } as Poll;
    };

    const loadPolls = async () => {
        setLoading(true);
        try {
            if (user?.email.toLowerCase().endsWith("@demo.com")) {
                setActivePolls([...loadDemoPublishedPolls(), ...demoActivePolls]);
                setClosedPolls(demoClosedPolls);
                return;
            }

            const [active, closed] = await Promise.all([
                PollsService.getActivePolls(),
                PollsService.getClosedPolls(),
            ]);

            const checkVotesPromises = [...(active || []), ...(closed || [])].map((poll: any) =>
                PollsService.hasUserVoted(poll.id, user!.id).then(res => ({ poll_id: poll.id, vote: res as any }))
            );
            const userVotesResults = await Promise.all(checkVotesPromises);
            const validUserVotes = userVotesResults
                .filter(result => result.vote !== null)
                .map((result: any) => ({ poll_id: result.poll_id, option_id: result.vote!.option_id }));

            setActivePolls((active || []).map((poll: any) => mapSupabasePoll(poll, validUserVotes)));
            setClosedPolls((closed || []).map((poll: any) => mapSupabasePoll(poll, validUserVotes)));
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
            if (user.email.toLowerCase().endsWith("@demo.com")) {
                setActivePolls(prev => {
                    const next = prev.map(poll => poll.id === pollId ? ({
                        ...poll,
                        totalVotes: poll.totalVotes + 1,
                        options: poll.options.map(option => option.id === optionId ? { ...option, votes: option.votes + 1 } : option),
                        ...({ hasVotedInit: true, votedOptionId: optionId } as any),
                    }) : poll);
                    saveDemoPublishedPolls(next);
                    return next;
                });
                return;
            }

            await PollsService.submitVote(pollId, optionId, user.id);
            await loadPolls();
        } catch (error: unknown) {
            console.error("Error voting:", error);
            const err = error as any;
            if (err.code === "23505") {
                toast({ title: "Ya has votado", description: "Solo puedes emitir un voto por consulta.", variant: "destructive" });
            } else {
                const errorMessage = error instanceof Error ? error.message : "Hubo un problema de conexion.";
                toast({ title: "Error al registrar el voto", description: errorMessage, variant: "destructive" });
            }
            throw error;
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center p-20 text-sm cc-text-secondary">Cargando consultas...</div>;
    }

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <header className="flex flex-col justify-between gap-5 border-b border-subtle pb-6 lg:flex-row lg:items-end">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Participacion comunitaria</p>
                    <h1 className="mt-2 text-3xl font-semibold cc-text-primary">Centro de votacion</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Revisa las consultas abiertas de tu comunidad, emite tu voto y consulta resultados historicos de forma ordenada.
                    </p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Estado actual</p>
                    <div className="mt-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success-fg" />
                        <span className="text-sm font-semibold cc-text-primary">{stats.pendingVotes} votacion(es) por revisar</span>
                    </div>
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                <MetricCard icon={<Vote className="h-5 w-5" />} label="Consultas activas" value={activePolls.length} helper="Disponibles para votar" />
                <MetricCard icon={<Users className="h-5 w-5" />} label="Votos activos" value={stats.totalActiveVotes} helper="Participacion registrada" />
                <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Cierran pronto" value={stats.closingSoon} helper="En los proximos 3 dias" dark />
            </section>

            <section className="rounded-lg border border-subtle bg-slate-950 p-6 text-white shadow-sm lg:p-8">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                    <div>
                        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-300">
                            <ShieldCheck className="h-4 w-4" />
                            Democracia digital
                        </div>
                        <h2 className="text-2xl font-semibold">Tu voto queda registrado para la decision comunitaria.</h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                            Las consultas abiertas se muestran con fecha de cierre, opciones y resultados agregados cuando ya participaste o cuando finalizan.
                        </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Confianza</p>
                        <p className="mt-2 text-3xl font-semibold">{activePolls.length + closedPolls.length}</p>
                        <p className="mt-1 text-sm text-slate-300">consultas en la comunidad</p>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 md:grid-cols-3">
                <ResidentFlowStep label="1. Revisa" text="Lee el contexto, fecha de cierre y alternativas disponibles." />
                <ResidentFlowStep label="2. Vota" text="Selecciona una opcion y confirma una sola vez." />
                <ResidentFlowStep label="3. Consulta" text="Despues de votar veras resultados agregados de la comunidad." />
            </section>

            <section className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold cc-text-primary">Consultas activas</h2>
                        <p className="mt-1 text-sm cc-text-secondary">Selecciona una opcion y confirma tu voto.</p>
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
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
                        <h2 className="flex items-center gap-2 text-xl font-semibold cc-text-primary">
                            <BarChart3 className="h-5 w-5 cc-text-secondary" />
                            Resultados historicos
                        </h2>
                        <p className="mt-1 text-sm cc-text-secondary">Consultas cerradas y participacion agregada.</p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {closedPolls.map((poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                initialHasVoted={(poll as any).hasVotedInit}
                                initialSelectedOption={(poll as any).votedOptionId}
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
        <article className={`rounded-lg border p-5 shadow-sm ${dark ? "border-slate-900 bg-slate-950 text-white" : "border-subtle bg-surface"}`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${dark ? "bg-white/10 text-brand-300" : "bg-brand-50 text-brand-600"}`}>
                {icon}
            </div>
            <p className={`mt-5 text-3xl font-semibold ${dark ? "text-white" : "cc-text-primary"}`}>{value}</p>
            <p className={`mt-1 text-xs font-bold uppercase tracking-[0.12em] ${dark ? "text-slate-400" : "cc-text-secondary"}`}>{label}</p>
            <p className={`mt-2 text-sm ${dark ? "text-slate-300" : "cc-text-secondary"}`}>{helper}</p>
        </article>
    );
}

function ResidentFlowStep({ label, text }: { label: string; text: string }) {
    return (
        <article className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">{label}</p>
            <p className="mt-2 text-sm leading-6 cc-text-secondary">{text}</p>
        </article>
    );
}
