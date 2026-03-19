"use client";

import { useState, useEffect } from "react";
import { ExpenseService } from "@/lib/services/supabaseServices";
import { FinanceDashboard } from "@/components/admin/FinanceDashboard";
import { CondoFeesTable } from "@/components/admin/CondoFeesTable";
import { motion } from "framer-motion";
import { CommunityFinance } from "@/lib/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function AdminFinanzasPage() {
    const [finances, setFinances] = useState<CommunityFinance | null>(null);

    useEffect(() => {
        const loadFinances = async () => {
            try {
                const stats = await ExpenseService.getStats();
                setFinances({
                    totalRevenue: stats.totalRevenue,
                    totalExpenses: 8900000, // Placeholder
                    reserveFund: 45200000,  // Placeholder
                    collectionRate: Math.round(stats.collectionRate || 0),
                    recentActivity: [
                        { id: 'a1', type: 'income', title: 'Recaudación Registrada', amount: stats.totalRevenue, date: new Date().toISOString() },
                    ]
                });
            } catch (err) {
                console.error("Error loading finance stats:", err);
            }
        };
        loadFinances();
    }, []);

    if (!finances) return <div className="p-10 text-center text-slate-500">Cargando finanzas...</div>;

    return (
        <ErrorBoundary name="Community Finances Page">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-7xl mx-auto py-10 px-4 md:px-8"
            >
                <FinanceDashboard data={finances} />
                <div className="mt-12">
                    <CondoFeesTable />
                </div>
            </motion.div>
        </ErrorBoundary>
    );
}
