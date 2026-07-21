"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    AlertCircle,
    ArrowRight,
    Bell,
    CheckSquare,
    Coins,
    Sparkles,
    Users,
    Wrench,
} from "lucide-react";
import { AdminDashboardService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import type { AdminDashboardSummary } from "@/lib/types";
import { Button } from "@/components/cc/Button";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { KpiCard } from "@/components/cc/KpiCard";
import { Tag } from "@/components/cc/Tag";
import { DATA_PALETTE, FoldedBar } from "@/components/cc/viz/FoldedBar";
import { BigDonut } from "@/components/cc/viz/ScoreDonut";
import { DotMatrix } from "@/components/cc/viz/DotMatrix";

function money(value: number) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${value.toLocaleString("es-CL")}`;
}

function pct(numerator: number, denominator: number) {
    if (denominator <= 0) return 0;
    return Math.round((numerator / denominator) * 100);
}

export default function AdminDashboardPage() {
    const { user } = useAuth();
    const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function loadSummary() {
            if (!user) return;
            setLoading(true);
            try {
                const data = await AdminDashboardService.getSummary(user);
                if (mounted) setSummary(data);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadSummary();
        return () => {
            mounted = false;
        };
    }, [user]);

    const data = summary;
    const residentsFilled = data ? Math.min(data.residentsActive, 96) : 0;
    const hasRequests = Boolean(data?.activeRequests.length);
    const buildingCoverSrc = user?.communityCoverPhotoUrl || "/edificio-malaga-exterior.jpg";

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <Eyebrow className="mb-2">Panel administrador</Eyebrow>
                    <DisplayHeading size={42}>
                        Tu edificio, <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>de un vistazo</em>
                    </DisplayHeading>
                    <p className="mt-3 max-w-2xl text-sm leading-6 cc-text-secondary">
                        OperaciÃ³n, cobranza y actividad comunitaria en una vista ejecutiva conectada a datos reales.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/comunicaciones">
                        <Button variant="copper" size="sm">
                            <Bell size={14} /> Comunicar
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="relative aspect-[32/9] overflow-hidden" style={{ borderRadius: 22 }}>
                <Image
                    src={buildingCoverSrc}
                    alt="Foto de tu edificio"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                />
                <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(90deg, rgba(26,22,17,0.8) 0%, rgba(26,22,17,0.15) 70%)" }}
                />
                <div className="absolute inset-y-0 left-5 flex flex-col justify-center" style={{ color: "var(--cc-paper)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(244,239,230,0.7)" }}>Tu edificio</p>
                </div>
            </div>

            {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-36 animate-pulse rounded-xl border bg-paper" style={{ borderColor: "var(--cc-line)" }} />
                    ))}
                </div>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <KpiCard
                            eyebrow="Residentes activos"
                            value={data?.residentsActive || 0}
                            sub={data?.unitsTotal ? `/ ${data.unitsTotal} unidades` : "sin unidades"}
                            trend={{ value: data?.quorumPct ? `${data.quorumPct}% cobertura` : "sin base", direction: data?.quorumPct && data.quorumPct >= 70 ? "up" : "neutral" }}
                            icon={<Users size={15} />}
                            tone="sage"
                        />
                        <KpiCard
                            eyebrow="Cobranza del periodo"
                            value={`${data?.collectionRate || 0}%`}
                            sub={data ? `${money(data.collectionCollected)} de ${money(data.collectionTarget)}` : "$0"}
                            trend={{ value: data?.collectionRate && data.collectionRate >= 90 ? "saludable" : "revisar", direction: data?.collectionRate && data.collectionRate >= 90 ? "up" : "neutral" }}
                            icon={<Coins size={15} />}
                            tone="copper"
                        />
                        <KpiCard
                            eyebrow="Solicitudes abiertas"
                            value={data?.openRequests || 0}
                            sub={`${data?.criticalRequests || 0} crÃ­ticas`}
                            trend={{ value: `${data?.cocoCasesOpen || 0} casos CoCo`, direction: data?.criticalRequests ? "down" : "up" }}
                            icon={<Wrench size={15} />}
                            tone={data?.criticalRequests ? "rose" : "amber"}
                        />
                        <KpiCard
                            eyebrow="QuÃ³rum estimado"
                            value={`${data?.quorumPct || 0}%`}
                            sub="base de unidades"
                            trend={{ value: data?.quorumPct && data.quorumPct >= 75 ? "listo" : "faltan firmas", direction: data?.quorumPct && data.quorumPct >= 75 ? "up" : "neutral" }}
                            icon={<CheckSquare size={15} />}
                            tone="plum"
                        />
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
                        <section className="rounded-xl border bg-paper p-5 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="mb-6 flex items-start justify-between gap-4">
                                <div>
                                    <Eyebrow className="mb-2">RecaudaciÃ³n mensual</Eyebrow>
                                    <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                        Cobranza vs. emitido
                                    </h2>
                                </div>
                                <Link href="/admin/finanzas" className="inline-flex items-center gap-1 text-xs font-semibold text-copper">
                                    Ver finanzas <ArrowRight size={13} />
                                </Link>
                            </div>
                            {data?.monthlyCollection.length ? (
                                <div className="flex h-64 items-end gap-4 rounded-lg bg-paper-warm p-5" style={{ border: "1px solid var(--cc-line)" }}>
                                    {data.monthlyCollection.map((month) => {
                                        const collectedPct = pct(month.collected, month.target);
                                        return (
                                            <div key={month.label} className="flex h-full flex-1 flex-col justify-end gap-2">
                                                <div className="flex min-h-0 flex-1 items-end">
                                                    <FoldedBar pct={collectedPct} color={DATA_PALETTE.copper} orientation="vertical" />
                                                </div>
                                                <div className="text-center font-mono text-[10px] uppercase cc-text-tertiary">{month.label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyDashboardState title="Sin recaudaciÃ³n visible" detail="Cuando existan gastos comunes emitidos, el grÃ¡fico se completarÃ¡ automÃ¡ticamente." />
                            )}
                        </section>

                        <section className="rounded-xl border bg-paper p-5 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
                            <Eyebrow className="mb-2">Estado operativo</Eyebrow>
                            <h2 className="mb-5 text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Salud del edificio
                            </h2>
                            <BigDonut
                                value={`${data?.assetsOptimalPct || 0}%`}
                                label="Activos Ã³ptimos"
                                sub={`${data?.openRequests || 0} solicitudes abiertas`}
                                color={DATA_PALETTE.green}
                                pct={data?.assetsOptimalPct || 0}
                            />
                            <div className="mt-6 rounded-lg bg-paper-warm p-4" style={{ border: "1px solid var(--cc-line)" }}>
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-xs font-semibold cc-text-primary">Cobertura residencial</span>
                                    <span className="font-mono text-xs cc-text-secondary">{data?.residentsActive || 0}/{data?.unitsTotal || 0}</span>
                                </div>
                                <DotMatrix rows={4} cols={24} filled={residentsFilled} color={DATA_PALETTE.green} dotSize={6} gap={5} />
                            </div>
                        </section>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                        <section className="rounded-xl border bg-paper p-5 shadow-sm xl:col-span-1" style={{ borderColor: "var(--cc-line)" }}>
                            <Eyebrow className="mb-2">Por categorÃ­a</Eyebrow>
                            <h2 className="mb-5 text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Gasto comÃºn
                            </h2>
                            {data?.expenseCategories.length ? (
                                <div className="space-y-4">
                                    {data.expenseCategories.map((category) => (
                                        <div key={category.label}>
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <span className="truncate text-sm cc-text-primary">{category.label}</span>
                                                <span className="font-mono text-xs cc-text-secondary">{money(category.amount)}</span>
                                            </div>
                                            <FoldedBar pct={pct(category.amount, data.collectionTarget)} color={category.color} orientation="horizontal" thickness={9} rounded={999} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyDashboardState title="Sin desglose" detail="El detalle aparece cuando los gastos comunes incluyen Ã­tems." compact />
                            )}
                        </section>

                        <section className="rounded-xl border bg-paper p-5 shadow-sm xl:col-span-1" style={{ borderColor: "var(--cc-line)" }}>
                            <Eyebrow className="mb-2">Solicitudes activas</Eyebrow>
                            <h2 className="mb-5 text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Cola operacional
                            </h2>
                            {hasRequests ? (
                                <div className="space-y-3">
                                    {data?.activeRequests.map((request, index) => (
                                        <Link
                                            key={`${request.title}-${index}`}
                                            href="/admin/mantenimiento"
                                            className="flex items-start gap-3 rounded-lg border bg-paper-warm p-3 transition-colors hover:bg-paper"
                                            style={{ borderColor: "var(--cc-line)" }}
                                        >
                                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-copper" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold cc-text-primary">{request.title}</span>
                                                <span className="mt-1 line-clamp-2 block text-xs leading-5 cc-text-secondary">{request.detail}</span>
                                            </span>
                                            <Tag tone={request.tone} size="sm">{request.status}</Tag>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <EmptyDashboardState title="Sin solicitudes abiertas" detail="La operaciÃ³n no registra tareas pendientes relevantes." compact />
                            )}
                        </section>

                        <section className="relative overflow-hidden rounded-xl border bg-ink p-5 text-paper shadow-sm xl:col-span-1" style={{ borderColor: "rgba(250,247,241,0.08)" }}>
                            <div
                                aria-hidden
                                className="absolute -right-16 -top-20 h-56 w-56 rounded-full"
                                style={{ background: "radial-gradient(circle, rgba(156, 86, 54,0.35), transparent 62%)" }}
                            />
                            <div className="relative">
                                <div className="mb-5 flex items-center justify-between">
                                    <Tag tone="ink" solid dot>Asamblea</Tag>
                                    <Sparkles size={16} color="var(--cc-copper-soft)" />
                                </div>
                                <h2 className="text-3xl leading-none" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    QuÃ³rum para la prÃ³xima decisiÃ³n
                                </h2>
                                <p className="mt-3 text-sm leading-6 text-[rgba(250,247,241,0.72)]">
                                    CoCo puede preparar convocatoria, recordatorios y resumen de votos para acelerar la participaciÃ³n.
                                </p>
                                <div className="mt-6">
                                    <div className="mb-2 flex items-center justify-between text-xs text-[rgba(250,247,241,0.68)]">
                                        <span>ParticipaciÃ³n estimada</span>
                                        <span className="font-mono">{data?.quorumPct || 0}%</span>
                                    </div>
                                    <FoldedBar pct={data?.quorumPct || 0} color={DATA_PALETTE.copper} orientation="horizontal" thickness={12} rounded={999} />
                                </div>
                                <Link href="/votaciones" className="mt-6 inline-flex">
                                    <Button variant="copper" size="sm">
                                        Gestionar votaciÃ³n <ArrowRight size={14} />
                                    </Button>
                                </Link>
                            </div>
                        </section>
                    </div>

                    <section className="rounded-xl border bg-paper p-5 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <Eyebrow className="mb-2">Uso de amenidades</Eyebrow>
                                <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    Reservas y capacidad
                                </h2>
                            </div>
                            <Link href="/amenities" className="inline-flex items-center gap-1 text-xs font-semibold text-copper">
                                Gestionar espacios <ArrowRight size={13} />
                            </Link>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {(data?.amenityUsage || []).map((item, index) => (
                                <div key={item.label} className="rounded-lg bg-paper-warm p-4" style={{ border: "1px solid var(--cc-line)" }}>
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-semibold cc-text-primary">{item.label}</span>
                                        <span className="font-mono text-xs cc-text-secondary">{pct(item.collected, item.target)}%</span>
                                    </div>
                                    <FoldedBar
                                        pct={pct(item.collected, item.target)}
                                        color={[DATA_PALETTE.green, DATA_PALETTE.blue, DATA_PALETTE.yellow][index] || DATA_PALETTE.copper}
                                        orientation="horizontal"
                                        thickness={10}
                                        rounded={999}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function EmptyDashboardState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border bg-paper-warm p-4" style={{ borderColor: "var(--cc-line)" }}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
            <div>
                <p className="text-sm font-semibold cc-text-primary">{title}</p>
                <p className={`${compact ? "mt-1 text-xs" : "mt-2 text-sm"} leading-5 cc-text-secondary`}>{detail}</p>
            </div>
        </div>
    );
}
