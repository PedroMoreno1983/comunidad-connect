"use client";

import { useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    Clock3,
    HandCoins,
    HeartHandshake,
    Leaf,
    LockKeyhole,
    PackageCheck,
    ShieldCheck,
    ShoppingBasket,
    Users,
} from "lucide-react";
import { CommunityCollaborationService } from "@/lib/api";
import type {
    CollectivePurchaseCampaign,
    CommunityProject,
    NeighborMediationCase,
    TimeBankOffer,
} from "@/lib/types";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";
import { MutualSupportExperience } from "@/components/convivencia/MutualSupportExperience";

function formatCurrency(value: number) {
    return `$${value.toLocaleString("es-CL")}`;
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

export default function AdminConvivenciaPage() {
    const { toast } = useToast();
    const [mediations, setMediations] = useState<NeighborMediationCase[]>([]);
    const [timeBankOffers, setTimeBankOffers] = useState<TimeBankOffer[]>([]);
    const [purchases, setPurchases] = useState<CollectivePurchaseCampaign[]>([]);
    const [projects, setProjects] = useState<CommunityProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const [mediationData, timeBankData, purchaseData, projectData] = await Promise.all([
                    CommunityCollaborationService.getAdminMediationCases(),
                    CommunityCollaborationService.getTimeBankOffers(),
                    CommunityCollaborationService.getCollectivePurchases(),
                    CommunityCollaborationService.getCommunityProjects(),
                ]);

                if (cancelled) return;
                setMediations(mediationData);
                setTimeBankOffers(timeBankData);
                setPurchases(purchaseData);
                setProjects(projectData);
            } catch (loadError) {
                console.error("[AdminConvivencia] load failed:", loadError);
                if (!cancelled) setError("No fue posible cargar la gestion de convivencia.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const metrics = useMemo(() => {
        const escalated = mediations.filter(item => item.status === "escalated").length;
        const agreements = mediations.filter(item => item.status === "agreement").length;
        const activePurchases = purchases.filter(item => item.status !== "ordered").length;
        const activeProjects = projects.filter(item => item.status !== "completed").length;

        return [
            { label: "Casos por revisar", value: escalated.toString(), detail: "solo escalados", icon: ShieldCheck },
            { label: "Acuerdos", value: agreements.toString(), detail: "con trazabilidad", icon: CheckCircle2 },
            { label: "Compras activas", value: activePurchases.toString(), detail: "supervision comunitaria", icon: ShoppingBasket },
            { label: "Proyectos activos", value: activeProjects.toString(), detail: "participacion vecinal", icon: Leaf },
        ];
    }, [mediations, projects, purchases]);

    const collectiveSavings = useMemo(
        () => purchases.reduce(
            (sum, item) => sum + Math.max(0, item.retailPrice - item.unitPrice) * item.participants,
            0,
        ),
        [purchases],
    );

    const registerAgreement = async (id: string) => {
        setUpdatingCaseId(id);
        try {
            await CommunityCollaborationService.updateMediationStatus(id, "agreement");
            const updated = await CommunityCollaborationService.getAdminMediationCases();
            setMediations(updated);
            toast({
                title: "Acuerdo registrado",
                description: "El caso mantiene trazabilidad sin exponer borradores privados.",
                variant: "success",
            });
        } catch (updateError) {
            console.error("[AdminConvivencia] agreement failed:", updateError);
            toast({
                title: "No se pudo registrar el acuerdo",
                description: "Revisa los permisos del caso e intenta nuevamente.",
                variant: "destructive",
            });
        } finally {
            setUpdatingCaseId(null);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6" aria-live="polite">
                <div className="h-48 animate-pulse rounded-2xl bg-elevated" />
                <div className="grid gap-4 md:grid-cols-4">
                    {[0, 1, 2, 3].map(item => <div key={item} className="h-28 animate-pulse rounded-xl bg-elevated" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
            <section className="overflow-hidden rounded-2xl bg-[#17130f] p-7 text-white shadow-sm sm:p-9">
                <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
                    <div>
                        <Eyebrow className="text-white/55">Gobernanza comunitaria</Eyebrow>
                        <DisplayHeading size={42} className="mt-3 text-white">
                            Gestionar la convivencia <em className="text-[#efb18f]">sin invadirla</em>.
                        </DisplayHeading>
                        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65">
                            Aqui administras casos que los residentes escalaron expresamente y observas la salud de las iniciativas comunitarias. No compras, no solicitas apoyos y no participas como vecino.
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-start gap-3">
                            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#efb18f]" />
                            <div>
                                <p className="text-sm font-semibold">Privacidad por diseno</p>
                                <p className="mt-1 text-xs leading-5 text-white/55">
                                    Los borradores y mensajes privados no aparecen aqui. Solo veras casos escalados y acuerdos ya gestionados.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div className="rounded-xl border border-danger-border bg-danger-bg p-4 text-sm text-danger-fg">
                    {error}
                </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map(metric => {
                    const Icon = metric.icon;
                    return (
                        <div key={metric.label} className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] cc-text-tertiary">{metric.label}</p>
                                <Icon className="h-4 w-4 text-brand-600" />
                            </div>
                            <p className="mt-3 text-3xl font-semibold cc-text-primary">{metric.value}</p>
                            <p className="mt-1 text-xs cc-text-secondary">{metric.detail}</p>
                        </div>
                    );
                })}
            </section>

            <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <Eyebrow>Casos escalados</Eyebrow>
                        <h2 className="mt-2 text-2xl font-semibold cc-text-primary">Bandeja de mediacion</h2>
                        <p className="mt-1 text-sm cc-text-secondary">Solo interviene Administracion cuando el residente lo solicita.</p>
                    </div>
                    <Tag tone="sage" solid>{mediations.filter(item => item.status === "escalated").length} pendientes</Tag>
                </div>

                <div className="mt-5 grid gap-4">
                    {mediations.length === 0 && (
                        <div className="rounded-xl border border-dashed border-subtle bg-elevated/40 px-6 py-12 text-center">
                            <HeartHandshake className="mx-auto h-9 w-9 cc-text-disabled" />
                            <p className="mt-3 font-semibold cc-text-primary">No hay casos escalados</p>
                            <p className="mt-1 text-sm cc-text-secondary">Los mensajes privados entre vecinos permanecen fuera de esta bandeja.</p>
                        </div>
                    )}

                    {mediations.map(item => (
                        <article key={item.id} className="rounded-xl border border-subtle bg-elevated/25 p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag tone={item.status === "agreement" ? "sage" : "copper"}>
                                            {item.status === "agreement" ? "Acuerdo registrado" : "Escalado"}
                                        </Tag>
                                        <span className="inline-flex items-center gap-1 text-xs cc-text-tertiary">
                                            <Clock3 className="h-3.5 w-3.5" /> {formatDate(item.createdAt)}
                                        </span>
                                    </div>
                                    <h3 className="mt-3 text-lg font-semibold cc-text-primary">Caso hacia unidad {item.targetUnit}</h3>
                                    <p className="mt-1 text-xs cc-text-tertiary">Escalado por {item.reporterName}</p>
                                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                                        <div><p className="text-[10px] font-semibold uppercase cc-text-tertiary">Hecho</p><p className="mt-1 text-sm cc-text-secondary">{item.observation}</p></div>
                                        <div><p className="text-[10px] font-semibold uppercase cc-text-tertiary">Necesidad</p><p className="mt-1 text-sm cc-text-secondary">{item.need}</p></div>
                                        <div><p className="text-[10px] font-semibold uppercase cc-text-tertiary">Peticion</p><p className="mt-1 text-sm cc-text-secondary">{item.request}</p></div>
                                    </div>
                                </div>
                                {item.status === "escalated" && (
                                    <Button type="button" variant="copper" disabled={updatingCaseId === item.id} onClick={() => void registerAgreement(item.id)}>
                                        Registrar acuerdo <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div><Eyebrow>Compras comunitarias</Eyebrow><h2 className="mt-2 text-2xl font-semibold cc-text-primary">Supervision, no compra</h2></div>
                        <div className="text-right"><p className="text-xl font-semibold cc-text-primary">{formatCurrency(collectiveSavings)}</p><p className="text-[10px] uppercase cc-text-tertiary">ahorro estimado</p></div>
                    </div>
                    <div className="mt-5 grid gap-3">
                        {purchases.length === 0 && <p className="rounded-xl bg-elevated/40 p-5 text-sm cc-text-secondary">No hay compras comunitarias activas.</p>}
                        {purchases.slice(0, 5).map(item => {
                            const progress = Math.min(100, Math.round((item.participants / item.minimumParticipants) * 100));
                            return (
                                <div key={item.id} className="rounded-xl border border-subtle p-4">
                                    <div className="flex items-start justify-between gap-4"><div><p className="font-semibold cc-text-primary">{item.title}</p><p className="mt-1 text-xs cc-text-secondary">{item.supplier} &middot; cierre {formatDate(item.deadline)}</p></div><Tag tone={item.status === "ready" ? "sage" : "neutral"}>{item.status}</Tag></div>
                                    <div className="mt-4 flex items-center justify-between text-xs cc-text-secondary"><span>{item.participants} de {item.minimumParticipants} unidades</span><span>{progress}%</span></div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                        <div className="flex items-center justify-between"><div><Eyebrow>Banco de tiempo</Eyebrow><h2 className="mt-2 text-xl font-semibold cc-text-primary">Actividad agregada</h2></div><HandCoins className="h-6 w-6 text-brand-600" /></div>
                        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-elevated/40 p-4"><p className="text-2xl font-semibold cc-text-primary">{timeBankOffers.length}</p><p className="text-xs cc-text-secondary">ofertas publicadas</p></div><div className="rounded-xl bg-elevated/40 p-4"><p className="text-2xl font-semibold cc-text-primary">{timeBankOffers.reduce((sum, item) => sum + item.requestsCount, 0)}</p><p className="text-xs cc-text-secondary">solicitudes</p></div></div>
                        <p className="mt-4 text-xs leading-5 cc-text-tertiary">Administracion ve actividad general; no solicita apoyos ni interviene en coordinaciones privadas.</p>
                    </div>
                    <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                        <div className="flex items-center justify-between"><div><Eyebrow>Proyectos comunitarios</Eyebrow><h2 className="mt-2 text-xl font-semibold cc-text-primary">Participacion visible</h2></div><Users className="h-6 w-6 text-brand-600" /></div>
                        <div className="mt-4 space-y-3">
                            {projects.length === 0 && <p className="text-sm cc-text-secondary">No hay proyectos activos.</p>}
                            {projects.slice(0, 4).map(project => <div key={project.id} className="flex items-center justify-between rounded-xl border border-subtle p-3"><div><p className="text-sm font-semibold cc-text-primary">{project.title}</p><p className="text-xs cc-text-tertiary">{project.participants} participantes</p></div><Tag tone={project.status === "active" ? "sage" : "neutral"}>{project.status}</Tag></div>)}
                        </div>
                    </div>
                </div>
            </section>

            <section id="apoyo-mutuo" className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <Eyebrow>Apoyo mutuo</Eyebrow>
                        <h2 className="mt-2 text-2xl font-semibold cc-text-primary">Fondo, solicitudes y tareas vecinales</h2>
                        <p className="mt-1 max-w-3xl text-sm cc-text-secondary">
                            Gestiona el ciclo solidario desde Convivencia: transparencia del fondo, solicitudes confidenciales y retribucion mediante tareas utiles.
                        </p>
                    </div>
                </div>
                <details className="group mt-5 rounded-xl border border-subtle bg-elevated/25">
                    <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold cc-text-primary">
                        Abrir gestion de Apoyo Mutuo
                    </summary>
                    <div className="border-t border-subtle"><MutualSupportExperience /></div>
                </details>
            </section>

            <section className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-5">
                <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
                <div><p className="text-sm font-semibold text-brand-900">Rol administrativo claro</p><p className="mt-1 text-xs leading-5 text-brand-800">Supermercado personal queda reservado al residente. Las compras grupales se observan aqui como operacion comunitaria, sin carro, pago ni identidad de comprador para Administracion.</p></div>
            </section>
        </div>
    );
}
