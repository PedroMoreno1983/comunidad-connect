"use client";

import { useState, useEffect } from "react";
import { ExpenseService } from "@/lib/services/supabaseServices";
import { FinanceDashboard } from "@/components/admin/FinanceDashboard";
import { CondoFeesTable } from "@/components/admin/CondoFeesTable";
import { motion } from "framer-motion";
import { CommunityFinance } from "@/lib/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AlertCircle, BellRing, FileText, Loader2, Send, ShieldCheck } from "lucide-react";

const fallbackFinances: CommunityFinance = {
    totalRevenue: 18450000,
    totalExpenses: 12980000,
    reserveFund: 5470000,
    collectionRate: 86,
    recentActivity: [
        { id: "demo-finance-1", type: "income", title: "Recaudacion mensual demo", amount: 18450000, date: new Date().toISOString() },
        { id: "demo-finance-2", type: "expense", title: "Pago mantencion ascensores", amount: 2450000, date: new Date(Date.now() - 864e5).toISOString() },
    ],
};

export default function AdminFinanzasPage() {
    const [finances, setFinances] = useState<CommunityFinance | null>(null);
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);

    useEffect(() => {
        const loadFinances = async () => {
            try {
                setLoading(true);
                const stats = await ExpenseService.getStats();
                setFinances({
                    totalRevenue: stats.totalRevenue,
                    totalExpenses: stats.totalBilled,
                    reserveFund: Math.max(0, stats.totalRevenue - stats.totalBilled * 0.8),
                    collectionRate: Math.round(stats.collectionRate || 0),
                    recentActivity: [
                        { id: 'a1', type: 'income', title: 'Recaudación Registrada', amount: stats.totalRevenue, date: new Date().toISOString() },
                    ]
                });
            } catch (err) {
                console.error("Error loading finance stats:", err);
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
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
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
                className="mx-auto max-w-6xl space-y-6 p-6"
            >
                {usingFallback && (
                    <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" />
                        <div>
                            <p className="font-semibold cc-text-primary">Mostrando datos demostrativos</p>
                            <p className="mt-1 text-sm cc-text-secondary">
                                No se pudo conectar con las finanzas reales. La vista queda operativa para revisar el flujo y no bloquea el modulo.
                            </p>
                        </div>
                    </div>
                )}
                <section className="grid gap-4 lg:grid-cols-3">
                    {[
                        {
                            title: "Cobranza prioritaria",
                            description: "Revisar unidades atrasadas antes del cierre del periodo.",
                            meta: "4 unidades en riesgo",
                            icon: <BellRing className="h-4 w-4" />,
                        },
                        {
                            title: "Reporte de comite",
                            description: "Preparar resumen de ingresos, egresos y fondo de reserva.",
                            meta: "Listo para exportar",
                            icon: <FileText className="h-4 w-4" />,
                        },
                        {
                            title: "Notificacion masiva",
                            description: "Enviar recordatorio de vencimiento con detalle del gasto comun.",
                            meta: "Canal email habilitado",
                            icon: <Send className="h-4 w-4" />,
                        },
                    ].map(item => (
                        <article key={item.title} className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-elevated cc-text-secondary">
                                {item.icon}
                            </div>
                            <h2 className="font-semibold cc-text-primary">{item.title}</h2>
                            <p className="mt-2 text-sm leading-6 cc-text-secondary">{item.description}</p>
                            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-info-bg px-2.5 py-1 text-xs font-semibold text-info-fg">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {item.meta}
                            </div>
                        </article>
                    ))}
                </section>
                <FinanceDashboard data={finances} />
                <div>
                    <CondoFeesTable />
                </div>
            </motion.div>
        </ErrorBoundary>
    );
}
