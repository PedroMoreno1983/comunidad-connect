"use client";

import { Button } from "@/components/ui/Button";
import { ExpensesService } from "@/lib/api";
import { DollarSign, Download, CheckCircle, Clock, AlertCircle, TrendingUp, CreditCard, Receipt, ArrowUpRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";

interface Expense {
    id: string;
    unitId: string;
    month: string;
    amount: number;
    status: 'paid' | 'pending' | 'overdue' | string;
    dueDate: string;
    paidAt?: string | null;
    breakdown?: { label: string; amount: number }[];
}

export default function ExpensesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaying, setIsPaying] = useState<string | null>(null);

    useEffect(() => {
        const fetchExpenses = async () => {
            if (!user?.unitId) {
                setIsLoading(false);
                return;
            }
            try {
                setIsLoading(true);
                const data = await ExpensesService.getExpenses(user.unitId);

                // Map snake_case to camelCase
                const mapped = data.map((exp: any) => ({
                    id: exp.id,
                    unitId: exp.unit_id,
                    month: exp.month,
                    amount: Number(exp.amount),
                    status: exp.status,
                    dueDate: exp.due_date,
                    paidAt: exp.paid_at,
                    breakdown: exp.items || []
                }));

                setExpenses(mapped);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : "Error desconocido";
                console.error("Error fetching expenses:", errorMessage);
                // Mostrar estado vacío en vez de error toast
                setExpenses([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchExpenses();
    }, [user?.unitId, toast]);

    const handlePay = async (id: string) => {
        try {
            setIsPaying(id);
            await ExpensesService.payExpense(id);

            // Optimistic update
            setExpenses(prev => prev.map(exp =>
                exp.id === id ? { ...exp, status: 'paid' } : exp
            ));

            toast({
                title: "Pago Exitoso",
                description: "La transacción ha sido procesada en la nube.",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "No se pudo procesar el pago.",
                variant: "destructive",
            });
        } finally {
            setIsPaying(null);
        }
    };

    const totalPending = expenses.filter(e => e.status !== 'paid').reduce((acc, curr) => acc + curr.amount, 0);
    const totalPaid = expenses.filter(e => e.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);
    const hasOverdue = expenses.some(e => e.status === 'overdue');

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'paid': return {
                icon: CheckCircle,
                label: 'Pagado',
                bg: 'bg-success-bg',
                text: 'text-success-fg',
                border: 'border-emerald-200 dark:border-emerald-500/20',
                ring: 'ring-emerald-500/20'
            };
            case 'pending': return {
                icon: Clock,
                label: 'Pendiente',
                bg: 'bg-warning-bg',
                text: 'text-warning-fg',
                border: 'border-amber-200 dark:border-amber-500/20',
                ring: 'ring-amber-500/20'
            };
            case 'overdue': return {
                icon: AlertCircle,
                label: 'Vencido',
                bg: 'bg-danger-bg',
                text: 'text-danger-fg',
                border: 'border-red-200 dark:border-red-500/20',
                ring: 'ring-red-500/20'
            };
            default: return {
                icon: Clock,
                label: status,
                bg: 'bg-slate-50 dark:bg-slate-700',
                text: 'cc-text-secondary',
                border: 'border-slate-200 dark:border-slate-600',
                ring: 'ring-slate-500/20'
            };
        }
    };

    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    };

    if (!user?.unitId && !isLoading) {
        return (
            <EmptyState
                icon={<DollarSign className="h-6 w-6" />}
                title="Unidad no asignada"
                description="Tu cuenta aún no tiene una unidad asignada. Contacta al administrador de tu comunidad para vincularte."
            />
        );
    }

    return (
        <div className="max-w-6xl space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl">
                        <DollarSign className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold cc-text-primary">Gastos Comunes</h1>
                </div>
                <p className="cc-text-secondary">
                    Historial de cobros y pagos de tu unidad{user?.unitId ? ` • Depto ${user.unitId}` : ''}
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Pending Card */}
                <div className={`relative overflow-hidden rounded-2xl p-6 ${hasOverdue ? 'bg-gradient-to-br from-[#EF4444] to-[#DB2777]' : 'bg-gradient-to-br from-rose-500 to-pink-600'} text-white shadow-xl shadow-rose-500/25`}>
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                        <DollarSign className="h-24 w-24" />
                    </div>
                    <div className="relative">
                        <p className="text-white/80 text-sm font-medium">Total Pendiente</p>
                        <p className="text-4xl font-bold mt-2">${totalPending.toLocaleString('es-CL')}</p>
                        {hasOverdue && (
                            <div className="mt-3 flex items-center gap-2 text-sm">
                                <AlertCircle className="h-4 w-4" />
                                <span>Tienes pagos vencidos</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Total Paid Card */}
                <div className="bg-surface rounded-2xl p-6 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-subtle">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-success-bg rounded-xl">
                            <TrendingUp className="h-5 w-5 text-success-fg" />
                        </div>
                        <span className="text-xs font-medium text-success-fg bg-success-bg px-2 py-1 rounded-full">
                            Al día
                        </span>
                    </div>
                    <p className="text-sm cc-text-secondary">Total Pagado</p>
                    <p className="text-2xl font-bold cc-text-primary mt-1">${totalPaid.toLocaleString('es-CL')}</p>
                </div>

                {/* Quick Pay Card */}
                <div className="bg-surface rounded-2xl p-6 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-subtle">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-role-admin-bg rounded-xl">
                            <CreditCard className="h-5 w-5 text-role-admin-fg" />
                        </div>
                    </div>
                    <p className="text-sm cc-text-secondary">Métodos de Pago</p>
                    <div className="flex items-center gap-2 mt-3">
                        <div className="h-8 w-12 bg-gradient-to-r from-blue-600 to-blue-400 rounded-md flex items-center justify-center text-white text-xs font-bold">VISA</div>
                        <div className="h-8 w-12 bg-gradient-to-r from-red-500 to-orange-400 rounded-md flex items-center justify-center text-white text-xs font-bold">MC</div>
                        <div className="h-8 w-12 bg-gradient-to-r from-slate-700 to-slate-500 rounded-md flex items-center justify-center text-white text-xs font-bold">PAC</div>
                    </div>
                </div>
            </div>

            {/* Payment History Table */}
            <div className="bg-surface rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-subtle overflow-hidden">
                <div className="p-6 border-b border-subtle">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-elevated rounded-xl">
                                <Receipt className="h-5 w-5 cc-text-secondary" />
                            </div>
                            <h2 className="text-lg font-bold cc-text-primary">Historial de Pagos</h2>
                        </div>
                        <button className="text-sm font-medium text-role-admin-fg hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1">
                            Descargar todo <Download className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <ErrorBoundary name="Historial de pagos">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-700/50 cc-text-secondary font-medium">
                                    <th className="px-6 py-4 text-left">Período</th>
                                    <th className="px-6 py-4 text-left">Vencimiento</th>
                                    <th className="px-6 py-4 text-left">Monto</th>
                                    <th className="px-6 py-4 text-left">Estado</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 relative">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="p-0">
                                            <SkeletonTable rows={3} />
                                        </td>
                                    </tr>
                                ) : (
                                    expenses.map((expense, idx) => {
                                        const status = getStatusConfig(expense.status);
                                        const StatusIcon = status.icon;

                                        return (
                                            <tr
                                                key={expense.id}
                                                className="hover:bg-elevated/50 transition-colors animate-slide-up opacity-0"
                                                style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                                            >
                                                <td className="px-6 py-4">
                                                    <p className="font-semibold cc-text-primary capitalize">{formatMonth(expense.month)}</p>
                                                </td>
                                                <td className="px-6 py-4 cc-text-secondary">
                                                    {new Date(expense.dueDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-lg font-bold cc-text-primary">
                                                        ${expense.amount.toLocaleString('es-CL')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${status.bg} ${status.text} ring-1 ring-inset ${status.ring}`}>
                                                        <StatusIcon className="h-3.5 w-3.5" />
                                                        {status.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {expense.status !== 'paid' ? (
                                                        <button
                                                            onClick={() => handlePay(expense.id)}
                                                            disabled={isPaying === expense.id}
                                                            className="inline-flex items-center justify-center min-w-[140px] gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all text-sm disabled:opacity-50 disabled:pointer-events-none"
                                                        >
                                                            {isPaying === expense.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <>Pagar Ahora <ArrowUpRight className="h-4 w-4" /></>
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button className="inline-flex items-center gap-2 px-4 py-2 bg-elevated cc-text-secondary font-medium rounded-xl hover:bg-elevated transition-colors text-sm">
                                                            <Download className="h-4 w-4" />
                                                            Comprobante
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </ErrorBoundary>

                {!isLoading && expenses.length === 0 && (
                    <div className="px-6 pb-6">
                        <EmptyState
                            icon={<DollarSign className="h-6 w-6" />}
                            title="Sin Registros"
                            description="No hay registros de gastos comunes disponibles para esta unidad en este momento."
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
