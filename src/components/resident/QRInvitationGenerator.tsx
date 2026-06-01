"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CheckCircle2, Copy, IdCard, Share2, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";
import { InvitationService } from "@/lib/services/supabaseServices";

export interface GeneratedInvitation {
    id: string;
    residentId: string;
    guestName: string;
    guestDni: string;
    status: "active";
    validFrom: string;
    validTo: string;
    qrCode: string;
}

export function QRInvitationGenerator({ onGenerated }: { onGenerated?: (invitation: GeneratedInvitation) => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [guestName, setGuestName] = useState("");
    const [guestDni, setGuestDni] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generated, setGenerated] = useState<GeneratedInvitation | null>(null);

    const qrCells = useMemo(() => {
        const seed = generated?.qrCode || "COMMUNITY";
        return Array.from({ length: 49 }, (_, index) => {
            if ([0, 1, 7, 8, 40, 41, 47, 48].includes(index)) return true;
            const code = seed.charCodeAt(index % seed.length);
            return (code + index * 7) % 3 !== 0;
        });
    }, [generated?.qrCode]);

    const handleGenerate = async () => {
        if (!user) {
            toast({
                title: "Sesion requerida",
                description: "Inicia sesion para generar pases asociados a tu unidad.",
                variant: "destructive",
            });
            return;
        }

        if (!guestName.trim() || !guestDni.trim()) {
            toast({
                title: "Faltan datos",
                description: "Ingresa nombre y documento del invitado.",
                variant: "destructive",
            });
            return;
        }

        setIsGenerating(true);
        try {
            const validFrom = new Date();
            const validTo = new Date(validFrom);
            validTo.setDate(validTo.getDate() + 1);
            const qrCodeValue = `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
            const invitation: GeneratedInvitation = {
                id: `local-${qrCodeValue}`,
                residentId: user.id,
                guestName: guestName.trim(),
                guestDni: guestDni.trim(),
                status: "active",
                validFrom: validFrom.toISOString(),
                validTo: validTo.toISOString(),
                qrCode: qrCodeValue,
            };

            await InvitationService.create({
                resident_id: user.id,
                guest_name: invitation.guestName,
                guest_dni: invitation.guestDni,
                qr_code: invitation.qrCode,
                valid_from: invitation.validFrom,
                valid_to: invitation.validTo,
            });

            setGenerated(invitation);
            onGenerated?.(invitation);
            toast({
                title: "Invitacion generada",
                description: "El pase quedo listo para conserjeria.",
                variant: "success",
            });
        } catch (error) {
            console.error("Error creating invitation:", error);
            toast({
                title: "No se pudo generar",
                description: "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = () => {
        if (!generated) return;
        navigator.clipboard.writeText(generated.qrCode);
        toast({ title: "Codigo copiado", description: "El pase quedo en el portapapeles.", variant: "success" });
    };

    const shareInvitation = async () => {
        if (!generated) return;
        const text = `Pase Convive Connect para ${generated.guestName}: ${generated.qrCode}`;
        if (navigator.share) {
            await navigator.share({ title: "Pase de visita", text }).catch(() => undefined);
            return;
        }
        navigator.clipboard.writeText(text);
        toast({ title: "Pase copiado", description: "Puedes pegarlo en WhatsApp o correo.", variant: "success" });
    };

    const reset = () => {
        setGuestName("");
        setGuestDni("");
        setGenerated(null);
    };

    return (
        <section className="rounded-lg border border-subtle bg-surface shadow-sm">
            <div className="border-b border-subtle p-5">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                        <UserPlus className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold cc-text-primary">Nuevo pase de visita</h2>
                        <p className="mt-1 text-sm leading-6 cc-text-secondary">
                            Genera un acceso temporal con trazabilidad para conserjeria.
                        </p>
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {!generated ? (
                    <motion.div
                        key="form"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="space-y-5 p-5"
                    >
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Invitado</label>
                            <Input
                                placeholder="Ej: Ana Garcia"
                                className="h-12 rounded-lg"
                                value={guestName}
                                onChange={(event) => setGuestName(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Documento</label>
                            <Input
                                placeholder="Ej: 12.345.678-9"
                                className="h-12 rounded-lg"
                                value={guestDni}
                                onChange={(event) => setGuestDni(event.target.value)}
                            />
                        </div>

                        <div className="grid gap-3 rounded-lg border border-subtle bg-elevated/40 p-4 text-sm cc-text-secondary">
                            <div className="flex items-center gap-2">
                                <CalendarClock className="h-4 w-4" />
                                Vigencia automatica de 24 horas.
                            </div>
                            <div className="flex items-center gap-2">
                                <IdCard className="h-4 w-4" />
                                Conserjería valida QR y documento.
                            </div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                El acceso queda registrado en bitacora.
                            </div>
                        </div>

                        <Button onClick={handleGenerate} disabled={isGenerating} className="h-12 w-full">
                            {isGenerating ? "Generando..." : "Generar pase QR"}
                        </Button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="generated"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="space-y-5 p-5"
                    >
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                            <div className="flex items-center gap-2 font-semibold">
                                <CheckCircle2 className="h-5 w-5" />
                                Pase activo
                            </div>
                            <p className="mt-1 text-sm leading-6">
                                {generated.guestName} puede presentarlo en conserjeria junto a su documento.
                            </p>
                        </div>

                        <div className="mx-auto grid aspect-square w-full max-w-[240px] grid-cols-7 gap-1 rounded-lg border border-subtle bg-white p-5 shadow-sm">
                            {qrCells.map((filled, index) => (
                                <span
                                    key={index}
                                    className={`rounded-[3px] ${filled ? "bg-slate-950" : "bg-slate-100"}`}
                                    aria-hidden="true"
                                />
                            ))}
                        </div>

                        <div className="rounded-lg border border-subtle bg-elevated/40 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Codigo</p>
                            <p className="mt-1 break-all font-mono text-xl font-bold cc-text-primary">{generated.qrCode}</p>
                            <p className="mt-2 text-xs cc-text-secondary">
                                Vence el {new Date(generated.validTo).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
                            </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <Button variant="outline" onClick={copyToClipboard}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar
                            </Button>
                            <Button onClick={shareInvitation}>
                                <Share2 className="mr-2 h-4 w-4" />
                                Compartir
                            </Button>
                        </div>

                        <button
                            type="button"
                            onClick={reset}
                            className="w-full rounded-lg px-4 py-2 text-sm font-semibold cc-text-secondary transition-colors hover:bg-elevated"
                        >
                            Crear otro pase
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
