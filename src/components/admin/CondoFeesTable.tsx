"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CondoFeeService } from "@/lib/services/supabaseServices";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

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

    if (loading) {
        return <div className="p-10 text-center text-slate-500">Cargando registros...</div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden"
        >
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Registro de Cobros</h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Historial y estado de los Gastos Comunes</p>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Unidad</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Mes / Vencimiento</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Monto</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Estado</th>
                            <th className="font-bold py-4 px-6 uppercase tracking-wider text-[10px]">Pago</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {fees.map((fee) => (
                            <tr key={fee.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                            {fee.units?.tower ? fee.units.tower[0] : ''}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white">Torre {fee.units?.tower || 'A'}</p>
                                            <p className="text-xs text-slate-500 font-medium">Auto {fee.units?.number}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <p className="font-bold text-slate-700 dark:text-slate-200 capitalize">
                                        {format(new Date(fee.month), 'MMMM yyyy', { locale: es })}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Vence: {format(new Date(fee.due_date), 'dd/MM/yyyy')}
                                    </p>
                                </td>
                                <td className="py-4 px-6">
                                    <span className="font-black text-slate-900 dark:text-white">${fee.amount.toLocaleString('es-CL')}</span>
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
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                                <CreditCard className="w-3 h-3 text-slate-400" />
                                                {fee.payment_method === 'haulmer' ? 'Haulmer Pay' : 'Transferencia'}
                                            </span>
                                            {fee.paid_at && (
                                                <span className="text-[10px] text-slate-400">
                                                    {format(new Date(fee.paid_at), 'dd/MM HH:mm')}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 inline-block">
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
