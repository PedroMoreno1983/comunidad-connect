"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Users } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import type { SignupResponse } from "@/lib/types";

export default function SignUpPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [accessCode, setAccessCode] = useState("");
    const [departmentNumber, setDepartmentNumber] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [whatsappOptIn, setWhatsappOptIn] = useState(false);
    const [accessCodeError, setAccessCodeError] = useState("");
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
            return;
        }

        if (password.length < 8) {
            toast({ title: "Error", description: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" });
            return;
        }

        if (!accessCode.trim()) {
            const message = "Debes ingresar un código de invitación";
            setAccessCodeError(message);
            toast({ title: "Error", description: message, variant: "destructive" });
            return;
        }

        setAccessCodeError("");
        setLoading(true);
        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName,
                    email,
                    password,
                    accessCode,
                    departmentNumber,
                    acceptTerms,
                    acceptPrivacy,
                    whatsappOptIn,
                }),
            });
            const result = await response.json() as SignupResponse;
            if (!response.ok) {
                const message = result.error || 'No se pudo crear la cuenta.';
                if (message.toLowerCase().includes("código") || message.toLowerCase().includes("invitación")) {
                    setAccessCodeError(message);
                }
                throw new Error(message);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo crear la cuenta.";
                const title = message.includes("perfil") ? "Rol no coincide" : "Código inválido";
            toast({ title, description: message, variant: "destructive" });
            setLoading(false);
            return;
        }

        toast({
            title: "Cuenta creada",
            description: `Enviamos un enlace de verificación a ${email}. Confirma tu correo antes de iniciar sesión.`,
            variant: "success",
        });
        router.push("/login?check_email=1");
    };

    return (
        <main className="min-h-screen flex" style={{ background: "var(--cc-ivory)" }}>
            <div className="grid w-full lg:grid-cols-[440px_1fr]">
                <section className="flex items-center justify-center p-6 sm:p-12 overflow-y-auto w-full">
                    <div className="w-full max-w-[360px] space-y-7">
                        <div className="flex justify-between items-start">
                            <div>
                        <Eyebrow className="mb-2">INVITACIÓN</Eyebrow>
                                <DisplayHeading size={36}>
                                    Crear <br />
                                    <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>cuenta.</em>
                                </DisplayHeading>
                            </div>
                            <Link href="/" className="grid place-items-center w-9 h-9 rounded-xl border transition-colors hover:bg-paper-warm" style={{ borderColor: "var(--cc-line)" }}>
                                <ArrowLeft size={16} />
                            </Link>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Field label="NOMBRE COMPLETO" htmlFor="full-name">
                                <input
                                    id="full-name"
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan Perez"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </Field>

                            <Field label="CORREO ELECTRÓNICO" htmlFor="email">
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@correo.com"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </Field>

                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label htmlFor="password" className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">CONTRASEÑA</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-xs font-medium text-slate-400 hover:text-slate-600"
                                            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    >
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    minLength={8}
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <Field label="CONFIRMAR CONTRASEÑA" htmlFor="confirm-password">
                                <input
                                    id="confirm-password"
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repite tu contraseña"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </Field>

                            <Field label="CÓDIGO DE INVITACIÓN" htmlFor="access-code">
                                <input
                                    id="access-code"
                                    type="text"
                                    value={accessCode}
                                    onChange={(e) => {
                                        setAccessCode(e.target.value.toUpperCase());
                                        setAccessCodeError("");
                                    }}
                                    placeholder="INV-X93F"
                                    required
                                    aria-invalid={Boolean(accessCodeError)}
                                    aria-describedby={accessCodeError ? "access-code-error" : undefined}
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all font-mono uppercase tracking-[0.16em]"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                                {accessCodeError && (
                                    <p id="access-code-error" role="alert" className="text-xs font-medium text-red-700">
                                        {accessCodeError}
                                    </p>
                                )}
                            </Field>

                            <Field label="DEPARTAMENTO / UNIDAD (SOLO RESIDENTES)" htmlFor="department-number">
                                <input
                                    id="department-number"
                                    type="text"
                                    value={departmentNumber}
                                    onChange={(e) => setDepartmentNumber(e.target.value)}
                                    placeholder="Ej: 501, 3B, 1201"
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </Field>

                            <div className="space-y-3 rounded-xl border p-4 text-xs text-slate-600" style={{ borderColor: "var(--cc-line-strong)" }}>
                                <label className="flex items-start gap-3">
                                    <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required className="mt-0.5" />
                                    <span>Acepto los <Link href="/terms" target="_blank" className="font-semibold underline">términos del servicio</Link>.</span>
                                </label>
                                <label className="flex items-start gap-3">
                                    <input type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} required className="mt-0.5" />
                                    <span>Confirmo que leí la <Link href="/privacy" target="_blank" className="font-semibold underline">política de privacidad</Link>.</span>
                                </label>
                                <label className="flex items-start gap-3">
                                    <input type="checkbox" checked={whatsappOptIn} onChange={(event) => setWhatsappOptIn(event.target.checked)} className="mt-0.5" />
                                    <span>Quiero recibir avisos operativos por WhatsApp. Es opcional y puedo retirarlo después.</span>
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-ink text-paper text-sm font-semibold rounded-xl inline-flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors mt-2"
                                style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                            >
                                {loading ? "Creando cuenta..." : "Crear cuenta"}
                                <ArrowRight size={15} />
                            </button>
                        </form>

                        <div className="pt-2 text-center">
                            <Link href="/login" className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                            ¿Ya tienes cuenta? <span className="text-copper underline">Iniciar sesión</span>
                            </Link>
                        </div>
                    </div>
                </section>

                <section
                    className="hidden lg:flex flex-col relative overflow-hidden p-12 justify-between"
                    style={{
                        background: "linear-gradient(135deg, #1A1611 0%, #2D241D 100%)",
                        color: "var(--cc-paper)",
                    }}
                >
                    <div
                        aria-hidden
                        className="absolute top-1/4 left-0 w-[400px] h-[400px] rounded-full blur-3xl pointer-events-none"
                        style={{ background: "radial-gradient(circle, rgba(156, 86, 54,0.2) 0%, transparent 70%)" }}
                    />

                    <div className="relative z-10 flex justify-end">
                        <Link href="/" className="inline-flex items-center gap-2">
                            <Brand size={20} tone="inverse" withMark />
                        </Link>
                    </div>

                    <div className="relative z-10 max-w-md my-auto space-y-8 ml-auto text-right">
                        <div className="space-y-4">
                            <span className="text-[10px] font-semibold tracking-widest text-[#C99572] uppercase">ACCESO CONTROLADO</span>
                            <DisplayHeading size={44} style={{ color: "var(--cc-paper)" }}>
                                Cada usuario entra con<br />
                                el <em style={{ color: "var(--cc-copper-soft)", fontStyle: "italic" }}>rol correcto.</em>
                            </DisplayHeading>
                            <p className="text-sm leading-relaxed" style={{ color: "var(--cc-ink-faint)" }}>
                            Los códigos separan los accesos de residentes, conserjería y administración para garantizar que tus datos y acciones se mantengan seguros.
                            </p>
                        </div>

                        <div
                            className="rounded-2xl border p-5 shadow-xl bg-[#1A1611]/90 backdrop-blur-md relative transform rotate-[1deg] translate-y-2 text-left"
                            style={{ borderColor: "rgba(250, 247, 241, 0.1)" }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-[rgba(250,247,241,0.08)]">
                                    <Users className="h-5 w-5 text-white" />
                                </div>
                                <div className="text-xs font-semibold">Seguridad y privacidad garantizadas</div>
                            </div>
                        </div>

                        <div className="flex gap-1.5 justify-end pt-4">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(250,247,241,0.2)" }} />
                            <span className="w-6 h-1.5 rounded-full" style={{ background: "var(--cc-copper)" }} />
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(250,247,241,0.2)" }} />
                        </div>
                    </div>

                    <div className="relative z-10 text-xs text-right" style={{ color: "var(--cc-ink-tertiary)" }}>
                        2026 Convive Connect. Todos los derechos reservados.
                    </div>
                </section>
            </div>
        </main>
    );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={htmlFor} className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">{label}</label>
            {children}
        </div>
    );
}
