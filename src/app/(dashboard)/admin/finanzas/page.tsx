"use client";

import { useState, useEffect } from "react";
import { ExpenseService } from "@/lib/services/supabaseServices";
import { FinanceDashboard } from "@/components/admin/FinanceDashboard";
import { CondoFeesTable } from "@/components/admin/CondoFeesTable";
import { motion } from "framer-motion";
import { CommunityFinance } from "@/lib/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AlertCircle, Loader2 } from "lucide-react";

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
                <FinanceDashboard data={finances} />
                <div>
                    <CondoFeesTable />
                </div>
            </motion.div>
        </ErrorBoundary>
    );
}
