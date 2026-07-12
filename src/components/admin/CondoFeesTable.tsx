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

export function CondoFeesTable() {
    const [fees, setFees] = useState<CondoFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | CondoFee["status"]>("all");
    const { user } = useAuth();
    const { toast } = useToast();

    const loadFees = useCallback(async () => {
        try {
            setLoading(true);

            const data = await CondoFeeService.getAll();
            setFees(data || []);
        } catch (error) {
            console.error("Error loading condo fees:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFees();
    }, [loadFees]);

    const handleSendEmails = async () => {

        if (!user?.communityId) {
            toast({ title: "Error", description: "No se encontró tu comunidad.", variant: "destructive" });
            return;
        }
        setSending(true);
        try {
            const month = fees
                .filter(fee => fee.status !== 'paid')
                .map(fee => fee.month)
                .sort((a, b) => b.localeCompare(a))[0];
            if (!month) {
                toast({ title: "Sin pendientes", description: "No hay cobros abiertos para notificar.", variant: "default" });
                return;
            }

            const res = await fetch('/api/email/send-expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    communityId: user.communityId,
                    month,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                toast({
                    title: "Emails enviados",
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
        return <div className="p-10 text-center cc-text-secondary">Cargando registros...</div>;
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
            className="w-full overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
        >
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--cc-line)" }}>
                <div>
                    <h3 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Registro de cobros</h3>
                    <p className="mt-1 text-sm cc-text-secondary">Historial y estado de los gastos comunes</p>
                </div>
                <button
                    onClick={handleSendEmails}
                    disabled={sending || !fees.some(fee => fee.status !== 'paid')}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: "var(--cc-copper)" }}
                >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {sending ? 'Enviando...' : 'Enviar a Residentes'}
                </button>
            </div>

            <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_auto] lg:items-center" style={{ borderColor: "var(--cc-line)" }}>
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--cc-ink-faint)" }} />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Buscar por torre, unidad o mes"
                        className="h-11 w-full rounded-lg border pl-10 pr-4 text-sm font-medium outline-none transition-colors focus:border-[var(--cc-copper)] focus:ring-2 focus:ring-[var(--cc-copper)]/15"
                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
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
                            className="rounded-full px-3 py-2 text-xs font-semibold transition-colors"
                            style={statusFilter === key
                                ? { background: "var(--cc-ink)", color: "#fff" }
                                : { background: "var(--cc-paper-warm)", color: "var(--cc-ink-muted)" }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>
                        <tr>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Unidad</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Mes / Vencimiento</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Monto</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Estado</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Pago</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cc-line)]">
                        {filteredFees.map((fee) => (
                            <tr key={fee.id} className="transition-colors hover:bg-[var(--cc-paper-warm)]">
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                            {fee.units?.tower ? fee.units.tower[0] : ''}
                                        </div>
                                        <div>
                                            <p className="font-semibold cc-text-primary">Torre {fee.units?.tower || 'A'}</p>
                                            <p className="text-xs cc-text-tertiary font-medium">Depto {fee.units?.number}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <p className="font-bold cc-text-secondary capitalize">
                                        {safeFormatDate(fee.month, 'MMMM yyyy', true)}
                                    </p>
                                    <p className="text-xs cc-text-tertiary">
                                        Vence: {safeFormatDate(fee.due_date, 'dd/MM/yyyy')}
                                    </p>
                                </td>
                                <td className="py-4 px-6">
                                    <span className="font-semibold cc-text-primary">{formatCurrency(fee.amount)}</span>
                                </td>
                                <td className="py-4 px-6">
                                    {fee.status === 'paid' && (
                                        <Badge variant="success">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Pagado
                                        </Badge>
                                    )}
                                    {fee.status === 'pending' && (
                                        <Badge variant="warning">
                                            <Clock className="w-3 h-3 mr-1" /> Pendiente
                                        </Badge>
                                    )}
                                    {fee.status === 'overdue' && (
                                        <Badge variant="danger">
                                            <AlertCircle className="w-3 h-3 mr-1" /> Atrasado
                                        </Badge>
                                    )}
                                </td>
                                <td className="py-4 px-6">
                                    {fee.status === 'paid' ? (
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold cc-text-secondary flex items-center gap-1">
                                                <CreditCard className="w-3 h-3" style={{ color: "var(--cc-ink-faint)" }} />
                                                {fee.payment_method === 'haulmer' ? 'Haulmer Pay' : 'Transferencia'}
                                            </span>
                                            {fee.paid_at && (
                                                <span className="text-[10px] cc-text-tertiary">
                                                    {safeFormatDate(fee.paid_at, 'dd/MM HH:mm')}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs cc-text-tertiary border rounded-full px-2 py-1 inline-block" style={{ borderColor: "var(--cc-line)" }}>
                                            Esperando pago
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredFees.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-12 text-center cc-text-secondary font-medium">
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
