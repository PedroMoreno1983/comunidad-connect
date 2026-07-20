"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { VisitorService } from "@/lib/services/supabaseServices";
import { useAuth } from "@/lib/authContext";
import { VisitorLog } from "@/lib/types";

type ValidationResult = {
    guestName: string;
    guestDni?: string | null;
    unitNumber: string;
    validTo: string;
};

export function QRAccessValidator({ onScanSuccess }: { onScanSuccess?: (log: VisitorLog) => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [code, setCode] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [result, setResult] = useState<ValidationResult | null>(null);
    const [error, setError] = useState("");

    const validateCode = async (event: FormEvent) => {
        event.preventDefault();
        if (!user?.id || !code.trim()) return;
        setIsValidating(true);
        setResult(null);
        setError("");
        try {
            const redeemed = await VisitorService.redeemInvitation(code, user.id);
            if (!redeemed) {
                setError("El codigo no existe, ya fue utilizado o esta fuera de vigencia.");
                toast({ title: "Acceso denegado", description: "El pase no es valido para ingreso.", variant: "destructive" });
                return;
            }

            const unitNumber = redeemed.invitation.units?.number || redeemed.invitation.unit_id || "Sin unidad";
            const validationResult = {
                guestName: redeemed.invitation.guest_name,
                guestDni: redeemed.invitation.guest_dni,
                unitNumber,
                validTo: redeemed.invitation.valid_to,
            };
            setResult(validationResult);
            setCode("");

            const log: VisitorLog = {
                id: redeemed.log.id,
                visitorName: redeemed.log.visitor_name || validationResult.guestName,
                unitId: unitNumber,
                entryTime: redeemed.log.entry_time || new Date().toISOString(),
                isQr: true,
            };
            onScanSuccess?.(log);
            toast({ title: "Acceso autorizado", description: `Ingreso registrado para ${validationResult.guestName}.`, variant: "success" });
        } catch (validationError) {
            console.error("QR validation failed:", validationError);
            setError("No fue posible validar el pase. No autorices el ingreso y vuelve a intentar.");
            toast({ title: "Validacion no disponible", description: "No se registro ningun ingreso.", variant: "destructive" });
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={validateCode} className="rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "var(--cc-ink)" }}>
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: "var(--cc-copper)" }}>Control de acceso real</p>
                        <h2 className="mt-1 text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Validar pase QR</h2>
                        <p className="mt-2 text-sm leading-6 cc-text-secondary">Escanea con un lector QR o ingresa el código exacto presentado por la visita.</p>
                    </div>
                </div>

                <div className="mt-7 space-y-3">
                <label htmlFor="qr-access-code" className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Código de invitación</label>
                    <Input id="qr-access-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="INV-XXXXXXXX" autoComplete="off" autoFocus className="h-14 font-mono text-lg uppercase" />
                    <Button type="submit" disabled={isValidating || !code.trim() || !user?.id} className="h-12 w-full">
                        {isValidating ? "Validando..." : "Validar y registrar ingreso"}
                    </Button>
                </div>

                <div className="mt-6 rounded-xl border p-4 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    El pase se consume una sola vez. Solo se autoriza si esta activo, vigente y pertenece a esta comunidad.
                </div>
            </form>

            <div className="flex min-h-72 items-center justify-center rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} aria-live="polite">
                {result ? (
                    <div className="w-full text-center">
                        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
                        <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Ingreso registrado</p>
                        <h3 className="mt-2 text-3xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{result.guestName}</h3>
                        <p className="mt-2 cc-text-secondary">Unidad {result.unitNumber}</p>
                        {result.guestDni && <p className="mt-1 text-sm cc-text-tertiary">Documento: {result.guestDni}</p>}
                    </div>
                ) : error ? (
                    <div className="text-center">
                        <ShieldX className="mx-auto h-16 w-16 text-rose-600" />
                        <h3 className="mt-4 text-xl font-semibold cc-text-primary">Acceso denegado</h3>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 cc-text-secondary">{error}</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <ShieldCheck className="mx-auto h-16 w-16 cc-text-tertiary" />
                        <h3 className="mt-4 text-xl font-semibold cc-text-primary">Esperando un pase</h3>
                        <p className="mt-2 text-sm cc-text-secondary">La validacion consulta la invitacion real antes de registrar el ingreso.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
