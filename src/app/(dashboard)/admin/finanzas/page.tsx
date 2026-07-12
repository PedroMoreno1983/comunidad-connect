"use client";

import { useState, useEffect } from "react";
import { AdminFinanceService } from "@/lib/api";
import { FinanceDashboard } from "@/components/admin/FinanceDashboard";
import { CondoFeesTable } from "@/components/admin/CondoFeesTable";
import { motion } from "framer-motion";
import { CommunityFinance } from "@/lib/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AlertCircle, BellRing, FileText, Loader2, Send, ShieldCheck } from "lucide-react";
import { ModuleFlow } from "@/components/ui/ModuleFlow";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

const fallbackFinances: CommunityFinance = {
    period: new Date().toISOString().slice(0, 7),
    totalRevenue: 0,
    totalBilled: 0,
    totalExpenses: 0,
    reserveFund: 0,
    pendingAmount: 0,
    overdueAmount: 0,
    collectionRate: 0,
    totalUnits: 0,
    billedUnits: 0,
    paidUnits: 0,
    pendingUnits: 0,
    chronicDebtors: 0,
    monthlyTrend: [],
    categoryBreakdown: [],
    recentActivity: [],
};

export default function AdminFinanzasPage() {
    const [finances, setFinances] = useState<CommunityFinance | null>(null);
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);

    useEffect(() => {
        const loadFinances = async () => {
            try {
                setLoading(true);
                setFinances(await AdminFinanceService.getOverview());
            } catch {
                console.warn("Finance stats unavailable; showing empty operational state.");
                setUsingFallback(true);
                setFinances(fallbackFinances);
            } finally {
                setLoading(false);
            }
        };
        loadFinances();
    }, []);

    if (loading && !finances) {
        return (
            <div className="flex h-[50vh] items-center justify-center gap-3 text-sm font-semibold cc-text-secondary">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--cc-copper)" }} />
                Cargando finanzas...
            </div>
        );
    }

    if (!finances) return null;

    return (
        <ErrorBoundary name="Community Finances Page">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6"
            >
                <header>
                    <Eyebrow className="mb-2">Cierre financiero</Eyebrow>
                    <DisplayHeading size={32}>Finanzas de la comunidad</DisplayHeading>
                </header>

                {usingFallback && (
                    <div className="flex items-start gap-3 rounded-2xl border border-warning-border bg-warning-bg p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" />
                        <div>
                            <p className="font-semibold cc-text-primary">Sin conexión a datos financieros</p>
                            <p className="mt-1 text-sm cc-text-secondary">
                                No se pudo cargar la cartera real. Mantuvimos la estructura del módulo sin mostrar montos estimados ni actividad ficticia.
                            </p>
                        </div>
                    </div>
                )}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        {
                            title: "Cobranza prioritaria",
                            description: "Revisar unidades atrasadas antes del cierre del periodo.",
                            meta: "Segun cartera real",
                            icon: <BellRing className="h-4 w-4" />,
                        },
                        {
                            title: "Reporte de comité",
                            description: "Preparar resumen de ingresos, egresos y fondo de reserva.",
                            meta: "Requiere datos cargados",
                            icon: <FileText className="h-4 w-4" />,
                        },
                        {
                            title: "Notificación masiva",
                            description: "Enviar recordatorio de vencimiento con detalle del gasto común.",
                            meta: "Segun configuracion real",
                            icon: <Send className="h-4 w-4" />,
                        },
                    ].map(item => (
                        <article key={item.title} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--cc-paper-warm)", color: "var(--cc-copper)" }}>
                                {item.icon}
                            </div>
                            <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.title}</h2>
                            <p className="mt-2 text-sm leading-6 cc-text-secondary">{item.description}</p>
                            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-info-bg px-2.5 py-1 text-xs font-semibold text-info-fg">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {item.meta}
                            </div>
                        </article>
                    ))}
                </section>
                <ModuleFlow
                    title="Cierre financiero del periodo"
                    description="El flujo financiero debe partir en cobranza, cruzar ingresos y egresos, y terminar con reporte y recordatorios enviados."
                    statusLabel={`${finances.collectionRate}% cobranza`}
                    completedSteps={finances.collectionRate >= 95 ? 4 : finances.collectionRate >= 85 ? 2 : 0}
                    currentStep={finances.collectionRate >= 95 ? 4 : finances.collectionRate >= 85 ? 3 : 1}
                    primaryActionLabel={finances.collectionRate >= 85 ? "Preparar reporte" : "Gestionar cobranza"}
                    primaryActionHref={finances.collectionRate >= 85 ? "#control-financiero" : "#cobranzas"}
                    steps={[
                        "Revisar pagos pendientes",
                        "Validar ingresos y egresos",
                        "Preparar reporte de comité",
                        "Enviar recordatorios",
                    ]}
                    outcome="Cierre esperado: la administración sabe quién debe, cuánto se recaudó, qué gastos explicar y qué comunicaciones faltan."
                />
                <section id="control-financiero">
                    <FinanceDashboard data={finances} />
                </section>
                <div id="cobranzas">
                    <CondoFeesTable />
                </div>
            </motion.div>
        </ErrorBoundary>
    );
}
