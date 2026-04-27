"use client";

import { useState, useEffect } from "react";
import { safeFormatDate, formatCurrency } from "@/lib/utils";
import { CondoFeeService } from "@/lib/services/supabaseServices";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle, Mail, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";

interface CondoFee {
    id: string;
    unit_id: string;
    amount: number;
    month: string;
    status: 'pending' | 'paid' | 'overdue';
    due_date: string;
    paid_at?: string;
    payment_method?: string;
    units: {
        number: string;
        tower?: string;
    };
}

export function CondoFeesTable() {
    const [fees, setFees] = useState<CondoFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        loadFees();
    }, []);

    const loadFees = async () => {
        try {
            setLoading(true);
            const data = await CondoFeeService.getAll();
            setFees(data || []);
        } catch (error) {
            console.error("Error loading condo fees:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSendEmails = async () => {
        if (!user?.communityId) {
            toast({ title: "Error", description: "No se encontró tu comunidad.", variant: "destructive" });
            return;
        }
        setSending(true);
        try {
            // Get current month in YYYY-MM format
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Build items from current fees
            const totalAmount = fees.reduce((acc, f) => acc + (f.amount || 0), 0);

            const res = await fetch('/api/email/send-expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    communityId: user.communityId,
                    month,
                    totalAmount,
                    items: [{ label: 'Gastos Comunes', amount: totalAmount }],
                }),
            });
            const data = await res.json();
            if (res.ok) {
                toast({
                    title: "✉️ Emails enviados",
                    description: `${data.sent} residentes notificados correctamente.`,
                    variant: "success",
                });
            } else {
                throw new Error(data.error || 'Error desconocido');
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            toast({ title: "Error al enviar", description: msg, variant: "destructive" });
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return <div className="p-10 text-center text-slate-500">Cargando registros...</div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-surface rounded-[2rem] border border-subtle shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden"
        >
            <div className="p-8 border-b border-subtle flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-black cc-text-primary">Registro de Cobros</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Historial y estado de los Gastos Comunes</p>
                </div>
                <button
                    onClick={handleSendEmails}
                    disabled={sending || fees.length === 0}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-indigo-500/20"
                >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {sending ? 'Enviando...' : 'Enviar a Residentes'}
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-elevated/50 cc-text-secondary">
                        <tr>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Unidad</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Mes / Vencimiento</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Monto</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Estado</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Pago</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle/50">
                        {fees.map((fee) => (
                            <tr key={fee.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                            {fee.units?.tower ? fee.units.tower[0] : ''}
                                        </div>
                                        <div>
                                            <p className="font-bold cc-text-primary">Torre {fee.units?.tower || 'A'}</p>
                                            <p className="text-xs text-slate-500 font-medium">Auto {fee.units?.number}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <p className="font-bold cc-text-secondary capitalize">
                                        {safeFormatDate(fee.month, 'MMMM yyyy', true)}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Vence: {safeFormatDate(fee.due_date, 'dd/MM/yyyy')}
                                    </p>
                                </td>
                                <td className="py-4 px-6">
                                    <span className="font-black cc-text-primary">{formatCurrency(fee.amount)}</span>
                                </td>
                                <td className="py-4 px-6">
                                    {fee.status === 'paid' && (
                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Pagado
                                        </Badge>
                                    )}
                                    {fee.status === 'pending' && (
                                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none">
                                            <Clock className="w-3 h-3 mr-1" /> Pendiente
                                        </Badge>
                                    )}
                                    {fee.status === 'overdue' && (
                                        <Badge variant="destructive" className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none">
                                            <AlertCircle className="w-3 h-3 mr-1" /> Atrasado
                                        </Badge>
                                    )}
                                </td>
                                <td className="py-4 px-6">
                                    {fee.status === 'paid' ? (
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold cc-text-secondary flex items-center gap-1">
                                                <CreditCard className="w-3 h-3 text-slate-400" />
                                                {fee.payment_method === 'haulmer' ? 'Haulmer Pay' : 'Transferencia'}
                                            </span>
                                            {fee.paid_at && (
                                                <span className="text-[10px] text-slate-400">
                                                    {safeFormatDate(fee.paid_at, 'dd/MM HH:mm')}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-400 border border-subtle rounded-md px-2 py-1 inline-block">
                                            Esperando pago
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {fees.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-12 text-center text-slate-500 font-medium">
                                    No hay registros de Gastos Comunes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}
