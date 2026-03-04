"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    QrCode, Share2, Calendar, UserPlus,
    Smartphone, Download, Copy, Check,
    ShieldCheck, Info
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";
import { InvitationService } from "@/lib/services/supabaseServices";

export function QRInvitationGenerator({ onGenerated }: { onGenerated?: () => void }) {
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [guestName, setGuestName] = useState("");
    const [guestDni, setGuestDni] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [invitationCode, setInvitationCode] = useState("");
    const { toast } = useToast();

    const handleGenerate = async () => {
        if (!guestName || !guestDni) {
            toast({
                title: "Campos Requeridos",
                description: "Por favor complete los datos del invitado.",
                variant: "destructive"
            });
            return;
        }

        setIsGenerating(true);
        try {
            const qrCodeValue = `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

            if (user) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);

                await InvitationService.create({
                    resident_id: user.id,
                    guest_name: guestName,
                    guest_dni: guestDni,
                    qr_code: qrCodeValue,
                    valid_from: new Date().toISOString(),
                    valid_to: tomorrow.toISOString()
                });
            }

            setInvitationCode(qrCodeValue);
            setIsGenerating(false);
            setStep(2);
            toast({
                title: "Invitación Generada",
                description: "El código QR ya está listo para compartir.",
                variant: "success"
            });

            if (onGenerated) onGenerated();
        } catch (error) {
            console.error("Error creating invitation:", error);
            toast({
                title: "Error",
                description: "No se pudo generar la invitación. Intente nuevamente.",
                variant: "destructive"
            });
            setIsGenerating(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(invitationCode);
        toast({ title: "Copiado", description: "Código copiado al portapapeles." });
    };

    return (
        <div className="w-full max-w-md mx-auto">
            <AnimatePresence mode="wait">
                {step === 1 ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-8"
                    >
                        <div className="text-center space-y-2">
                            <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <UserPlus className="h-8 w-8" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Nueva Invitación</h2>
                            <p className="text-sm font-medium text-slate-400">Genere un acceso digital para su visita</p>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Invitado</label>
                                <Input
                                    placeholder="Ej: Ana García"
                                    className="h-14 rounded-2xl font-bold"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DNI / RUT</label>
                                <Input
                                    placeholder="Ej: 12.345.678-9"
                                    className="h-14 rounded-2xl font-bold"
                                    value={guestDni}
                                    onChange={(e) => setGuestDni(e.target.value)}
                                />
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex gap-3">
                                <Info className="h-5 w-5 text-blue-500 shrink-0" />
                                <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
                                    Esta invitación es válida por **24 horas** a partir de ahora. El invitado deberá presentar su documento de identidad original.
                                </p>
                            </div>

                            <Button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-lg shadow-xl shadow-blue-500/20 transition-all active:scale-95"
                            >
                                {isGenerating ? (
                                    <span className="flex items-center gap-2">
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        >
                                            <QrCode className="h-5 w-5" />
                                        </motion.div>
                                        Generando QR...
                                    </span>
                                ) : "Generar Acceso Digital"}
                            </Button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="qr"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="bg-slate-900 dark:bg-slate-950 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden text-center space-y-8"
                    >
                        {/* Decorative Background */}
                        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
                            <ShieldCheck className="h-48 w-48 text-blue-500" />
                        </div>

                        <div className="relative z-10 space-y-6">
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-white">¡Pase Listo!</h3>
                                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Unidad 101 • Válido 24hrs</p>
                            </div>

                            {/* QR Simulation Component */}
                            <div className="mx-auto w-64 h-64 bg-white p-6 rounded-[2.5rem] shadow-[0_0_50px_rgba(59,130,246,0.5)] relative group">
                                <div className="w-full h-full border-4 border-slate-900 rounded-2xl p-2 grid grid-cols-4 grid-rows-4 gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                    {/* Abstract QR Pattern */}
                                    {[...Array(16)].map((_, i) => (
                                        <div
                                            key={i}
                                            className={`rounded-sm ${Math.random() > 0.4 ? 'bg-slate-900' : 'bg-transparent'
                                                } ${i === 0 || i === 3 || i === 12 || i === 15 ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                                        />
                                    ))}
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-blue-600 p-3 rounded-xl shadow-xl">
                                        <Smartphone className="h-6 w-6 text-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Invitado</p>
                                    <p className="text-lg font-black text-white">{guestName}</p>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={copyToClipboard}
                                        className="flex-1 h-14 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Copy className="h-4 w-4" />
                                        Copiar
                                    </button>
                                    <button className="flex-1 h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 transition-all active:scale-95">
                                        <Share2 className="h-4 w-4" />
                                        Compartir
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => setStep(1)}
                                className="text-xs font-bold text-slate-500 hover:text-white transition-colors"
                            >
                                Crear otra invitación
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
