"use client";

import { useCallback, useState, useEffect } from "react";
import { safeFormatDate, formatCurrency } from "@/lib/utils";
import { CondoFeeService } from "@/lib/services/supabaseServices";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle, Mail, Loader2, Search } from "lucide-react";
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

const demoFees: CondoFee[] = [
    { id: "demo-fee-1204", unit_id: "demo-unit-1204", amount: 126900, month: "2026-05", status: "pending", due_date: "2026-05-15", units: { number: "1204", tower: "A" } },
    { id: "demo-fee-805", unit_id: "demo-unit-805", amount: 119500, month: "2026-05", status: "paid", due_date: "2026-05-15", paid_at: "2026-05-08T14:20:00.000Z", payment_method: "haulmer", units: { number: "805", tower: "A" } },
    { id: "demo-fee-1505", unit_id: "demo-unit-1505", amount: 141200, month: "2026-05", status: "overdue", due_date: "2026-05-05", units: { number: "1505", tower: "B" } },
    { id: "demo-fee-1802", unit_id: "demo-unit-1802", amount: 132800, month: "2026-05", status: "paid", due_date: "2026-05-15", paid_at: "2026-05-06T10:04:00.000Z", payment_method: "transfer", units: { number: "1802", tower: "B" } },
];

export function CondoFeesTable() {
    const [fees, setFees] = useState<CondoFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | CondoFee["status"]>("all");
    const { user } = useAuth();
    const { toast } = useToast();
    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    const loadFees = useCallback(async () => {
        try {
            setLoading(true);
            if (isDemoUser) {
                setFees(demoFees);
                return;
            }

            const data = await CondoFeeService.getAll();
            setFees(data || []);
        } catch (error) {
            console.error("Error loading condo fees:", error);
        } finally {
            setLoading(false);
        }
    }, [isDemoUser]);

    useEffect(() => {
        loadFees();
    }, [loadFees]);

    const handleSendEmails = async () => {
        if (isDemoUser) {
            setSending(true);
            setTimeout(() => {
                setSending(false);
                toast({
                    title: "Envio demo preparado",
                    description: "Se simulo la notificacion de cobros pendientes.",
                    variant: "success",
                });
            }, 500);
            return;
        }

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

    const filteredFees = fees.filter(fee => {
        const matchesStatus = statusFilter === "all" || fee.status === statusFilter;
        const text = `${fee.units?.tower || ""} ${fee.units?.number || ""} ${fee.month} ${fee.status}`.toLowerCase();
        return matchesStatus && text.includes(query.trim().toLowerCase());
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm"
        >
            <div className="flex items-center justify-between border-b border-subtle p-5">
                <div>
                    <h3 className="text-lg font-semibold cc-text-primary">Registro de cobros</h3>
                    <p className="mt-1 text-sm cc-text-secondary">Historial y estado de los gastos comunes</p>
                </div>
                <button
                    onClick={handleSendEmails}
                    disabled={sending || fees.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50"
                >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {sending ? 'Enviando...' : 'Enviar a Residentes'}
                </button>
            </div>

            <div className="grid gap-3 border-b border-subtle p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Buscar por torre, unidad o mes"
                        className="h-11 w-full rounded-lg border border-subtle bg-canvas pl-10 pr-4 text-sm font-medium outline-none transition-colors focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {([
                        ["all", "Todos"],
                        ["pending", "Pendientes"],
                        ["overdue", "Atrasados"],
                        ["paid", "Pagados"],
                    ] as Array<["all" | CondoFee["status"], string]>).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setStatusFilter(key)}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                statusFilter === key ? "bg-slate-950 text-white" : "bg-elevated cc-text-secondary hover:bg-surface"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
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
                        {filteredFees.map((fee) => (
                            <tr key={fee.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                            {fee.units?.tower ? fee.units.tower[0] : ''}
                                        </div>
                                        <div>
                                            <p className="font-semibold cc-text-primary">Torre {fee.units?.tower || 'A'}</p>
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
                                    <span className="font-semibold cc-text-primary">{formatCurrency(fee.amount)}</span>
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
                        {filteredFees.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-12 text-center text-slate-500 font-medium">
                                    {fees.length === 0 ? "No hay registros de gastos comunes." : "No hay cobros para esta busqueda."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}
