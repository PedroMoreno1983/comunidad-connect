"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Scan, ShieldCheck, ShieldAlert, CheckCircle2,
    XCircle, Clock, Search, History, Trash2,
    Check, X, UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { VisitorService } from "@/lib/services/supabaseServices";
import { useAuth } from "@/lib/authContext";
import { VisitorLog } from "@/lib/types";

export function QRScannerSimulator({ onScanSuccess }: { onScanSuccess?: (log: VisitorLog) => void }) {
    const { user } = useAuth();
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<Record<string, any> | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const { toast } = useToast();

    const simulateScan = async () => {
        setIsScanning(true);
        setScanResult(null);
        setScanError(null);

        // Simulate camera focus/processing
        setTimeout(async () => {
            // 70% chance of success, 30% error
            const isSuccess = Math.random() > 0.3;

            if (isSuccess) {
                const supabase = createClient();
                const { data } = await supabase
                    .from('qr_invitations')
                    .select('*')
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (data) {
                    const invitation = {
                        guestName: data.guest_name,
                        guestDni: data.guest_dni,
                        unitId: data.unit_id || "101",
                    };

                    try {
                        // Insert into DB
                        const newLog = await VisitorService.register({
                            visitor_name: data.guest_name,
                            unit_id: data.unit_id,
                            registered_by: user?.id || 'admin',
                        } as Parameters<typeof VisitorService.register>[0]);

                        // Mark invitation as used (optional, depends on your business rules)
                        // await VisitorService.cancel(data.id); 

                        setScanResult(invitation);
                        toast({
                            title: "Escaneo Exitoso",
                            description: `Acceso concedido a ${invitation.guestName}.`,
                            variant: "success"
                        });

                        if (onScanSuccess) {
                            onScanSuccess({
                                id: newLog.id,
                                visitorName: newLog.visitor_name,
                                unitId: newLog.unit_id,
                                entryTime: newLog.entry_time,
                                isQr: true
                            });
                        }
                    } catch (err) {
                        console.error("Error creating visitor log:", err);
                        setScanError("Error al registrar la visita en la bitácora.");
                    }
                } else {
                    setScanError("Código QR no válido o expirado.");
                    toast({
                        title: "Error de Validación",
                        description: "El código no coincide con ninguna invitación activa en la base de datos.",
                        variant: "destructive"
                    });
                }
            } else {
                setScanError("Lectura fallida. Reintente.");
                toast({
                    title: "Error de Lente",
                    description: "No se pudo leer el código correctamente.",
                    variant: "destructive"
                });
            }
            setIsScanning(false);
        }, 1500);
    };

    return (
        <div className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Scanner Interface */}
                <div className="bg-surface rounded-[3rem] p-10 border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none space-y-8">
                    <div className="space-y-2">
                        <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Seguridad & Accesos</h2>
                        <h1 className="text-3xl font-black cc-text-primary">Escáner Digital</h1>
                    </div>

                    <div className="relative aspect-square md:aspect-video rounded-[2.5rem] bg-slate-900 overflow-hidden flex flex-col items-center justify-center group">
                        {/* Scanning Animation */}
                        <AnimatePresence>
                            {isScanning && (
                                <motion.div
                                    initial={{ top: "0%" }}
                                    animate={{ top: "100%" }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                    className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_20px_rgba(59,130,246,1)] z-10"
                                />
                            )}
                        </AnimatePresence>

                        {/* Status UI */}
                        {!isScanning && !scanResult && !scanError && (
                            <div className="text-center space-y-4">
                                <div className="mx-auto w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center text-slate-400">
                                    <Scan className="h-10 w-10 group-hover:scale-110 transition-transform" />
                                </div>
                                <p className="text-slate-500 font-black uppercase text-xs tracking-widest">Esperando Código</p>
                            </div>
                        )}

                        {scanResult && (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-center space-y-4"
                            >
                                <div className="mx-auto w-24 h-24 bg-emerald-500/20 rounded-[2rem] flex items-center justify-center text-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                                    <ShieldCheck className="h-12 w-12" />
                                </div>
                                <p className="text-emerald-500 font-black uppercase text-sm tracking-[0.2em]">Acceso Permitido</p>
                            </motion.div>
                        )}

                        {scanError && (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-center space-y-4"
                            >
                                <div className="mx-auto w-24 h-24 bg-rose-500/20 rounded-[2rem] flex items-center justify-center text-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.3)]">
                                    <ShieldAlert className="h-12 w-12" />
                                </div>
                                <p className="text-rose-500 font-black uppercase text-sm tracking-[0.2em]">Invitación Inválida</p>
                            </motion.div>
                        )}

                        <div className="absolute bottom-10 left-0 right-0 px-10">
                            <Button
                                onClick={simulateScan}
                                disabled={isScanning}
                                className="w-full h-16 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-black text-lg transition-all active:scale-95 shadow-2xl"
                            >
                                {isScanning ? "Procesando..." : "Simular Escaneo"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Validation Info */}
                <div className="space-y-8">
                    <AnimatePresence mode="wait">
                        {scanResult ? (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="bg-emerald-600 rounded-[3rem] p-10 text-white shadow-2xl space-y-8 relative overflow-hidden"
                            >
                                <div className="relative z-10 space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Datos del Invitado</p>
                                            <h3 className="text-3xl font-black">{scanResult.guestName}</h3>
                                        </div>
                                        <UserCheck className="h-10 w-10 opacity-40" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">DNI / RUT</p>
                                            <p className="font-bold">{scanResult.guestDni}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Unidad Destino</p>
                                            <p className="text-2xl font-black">Depto {scanResult.unitId}</p>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-white/10 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 opacity-60" />
                                            <span className="text-xs font-bold">Válido hasta Hoy 23:59</span>
                                        </div>
                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-xs font-black uppercase tracking-widest">
                                            Autorizado
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : scanError ? (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="bg-rose-600 rounded-[3rem] p-10 text-white shadow-2xl space-y-6"
                            >
                                <div className="flex items-center gap-4">
                                    <XCircle className="h-10 w-10" />
                                    <h3 className="text-2xl font-black">Validación Fallida</h3>
                                </div>
                                <p className="font-medium opacity-80 leading-relaxed">
                                    El código QR presentado no corresponde a una invitación activa o está fuera de su rango de vigencia. Por favor, solicite una nueva invitación al residente.
                                </p>
                                <Button className="w-full bg-white/20 hover:bg-white/30 text-white rounded-2xl h-14 font-black">
                                    Intentar de nuevo
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="idle"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="bg-elevated/50 rounded-[3rem] p-16 flex flex-col items-center justify-center text-center space-y-6 border border-dashed border-default h-full"
                            >
                                <div className="w-20 h-20 bg-surface rounded-3xl shadow-xl flex items-center justify-center text-slate-300">
                                    <Search className="h-10 w-10" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black cc-text-primary">Listo para Escanear</h3>
                                    <p className="text-sm font-medium text-slate-400 max-w-[240px]">Escanee el código QR del invitado para autorizar su ingreso</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Recent Logs (Simulated) */}
            <div className="bg-surface rounded-[3rem] border border-subtle overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-none">
                <div className="p-10 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                            <History className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-xl font-black cc-text-primary">Historial de Accesos QR</h3>
                    </div>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {[
                        { name: "Carlos Ruiz", unit: "205", time: "Hace 15 min", status: "success" },
                        { name: "Delivery Express", unit: "101", time: "Hace 2 horas", status: "success" },
                        { name: "Inválido (Código Expirado)", unit: "-", time: "Hace 3 horas", status: "error" },
                    ].map((log, i) => (
                        <div key={i} className="p-8 flex items-center justify-between hover:bg-elevated/20 transition-colors">
                            <div className="flex items-center gap-5">
                                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${log.status === 'success'
                                    ? 'bg-success-bg text-emerald-600'
                                    : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600'
                                    }`}>
                                    {log.status === 'success' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                                </div>
                                <div>
                                    <p className="font-black cc-text-primary">{log.name}</p>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Unidad {log.unit}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black cc-text-primary">{log.time}</p>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${log.status === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {log.status === 'success' ? 'Verificado' : 'Denegado'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
