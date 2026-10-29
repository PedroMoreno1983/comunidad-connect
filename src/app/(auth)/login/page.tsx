"use client";

import { Suspense, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, ScanFace, Sparkles } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import { PasskeyService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { postLoginPath } from "@/lib/roleAccess";
import { isNativeApp } from "@/lib/native/biometricBridge";

const subscribeToBrowserCapabilities = () => () => {};
const getPasskeySupport = () => !isNativeApp() && window.isSecureContext && typeof window.PublicKeyCredential !== "undefined";
const getServerPasskeySupport = () => false;

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const searchParams = useSearchParams();
    const emailInputRef = useRef<HTMLInputElement>(null);
    const [email, setEmail] = useState(searchParams.get("email") || "");
    const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"mail" | "rut">("mail");
    const [enrollOnSubmit, setEnrollOnSubmit] = useState(false);
    const [pendingPasskeyDestination, setPendingPasskeyDestination] = useState<string | null>(null);
    const [enrollingPasskey, setEnrollingPasskey] = useState(false);
    const { signIn, signInWithPasskey } = useAuth();
    const passkeySupported = useSyncExternalStore(
        subscribeToBrowserCapabilities,
        getPasskeySupport,
        getServerPasskeySupport,
    );
    const router = useRouter();
    const { toast } = useToast();
    const nextParam = searchParams.get("next");
    const checkEmail = searchParams.get("check_email") === "1";

    const completeLogin = async (destination: string, shouldOfferPasskey: boolean) => {
        if (passkeySupported && shouldOfferPasskey) {
            setPendingPasskeyDestination(destination);
            setLoading(false);
            return;
        }
        router.replace(destination);
        router.refresh();
    };

    const handlePasskeySignIn = async () => {
        // Si el usuario ya escribió su correo y contraseña y toca el botón de Face ID,
        // iniciar sesión y pasar directo a activar su llave biométrica en este celular.
        if (email.trim() && password) {
            setLoading(true);
            const { error, role } = await signIn(email, password);
            if (error) {
                toast({
                    title: "Error al iniciar sesión",
                    description: error.message || "Verifica tu correo y contraseña para activar Face ID.",
                    variant: "destructive",
                });
                setLoading(false);
                return;
            }
            await completeLogin(postLoginPath(nextParam, role), true);
            return;
        }

        setLoading(true);
        const { error, role } = await signInWithPasskey();
        if (error) {
            setEnrollOnSubmit(true);
            setLoading(false);
            emailInputRef.current?.focus();
            toast({
                title: "Activa Face ID en este celular",
                description: "Ingresa tu correo y contraseña una sola vez abajo y pulsa «Entrar y activar Face ID».",
                variant: "default",
            });
            return;
        }
        router.replace(postLoginPath(nextParam, role));
        router.refresh();
    };

    const handleActivatePasskeyNow = async () => {
        if (!pendingPasskeyDestination) return;
        setEnrollingPasskey(true);
        try {
            await PasskeyService.register();
            toast({
                title: "Face ID / huella activado",
                description: "La próxima vez podrás entrar con un solo toque.",
                variant: "success",
            });
            router.replace(pendingPasskeyDestination);
            router.refresh();
        } catch (error) {
            toast({
                title: "No se pudo activar Face ID",
                description: error instanceof Error ? error.message : "Puedes activarlo después desde Mi perfil.",
                variant: "destructive",
            });
            setEnrollingPasskey(false);
        }
    };

    const handleResendConfirmation = async () => {
        if (!email.trim()) {
            toast({
                title: "Escribe tu correo",
                description: "Necesitamos saber a qué dirección reenviar el enlace.",
                variant: "destructive",
            });
            return;
        }
        setResendState("sending");
        try {
            await fetch("/api/auth/resend-confirmation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });
        } catch {
            // La respuesta del endpoint es deliberadamente genérica, así que un
            // fallo de red tampoco cambia lo que se le puede decir al usuario.
        }
        setResendState("sent");
        toast({
            title: "Enlace reenviado",
            description: "Si esa cuenta existe y aún no está verificada, recibirás un correo en unos minutos.",
            variant: "success",
        });
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);

        const { error, role } = await signIn(email, password);

        if (error) {
            toast({
                title: "Error al iniciar sesión",
                description: error.message || "Verifica tus credenciales",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        const destination = postLoginPath(nextParam, role);
        if (enrollOnSubmit && passkeySupported) {
            await completeLogin(destination, true);
            return;
        }

        toast({
            title: "Bienvenido",
            description: "Has iniciado sesión correctamente",
            variant: "success",
        });
        router.replace(destination);
        router.refresh();
    };

    return (
        <main className="flex min-h-screen" style={{ background: "var(--cc-ivory)" }}>
            <div className="grid w-full lg:grid-cols-2">
                <section
                    className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
                    style={{
                        background: "var(--cc-carbon)",
                        color: "var(--cc-paper)",
                    }}
                >
                    <Image
                        src="/edificio-malaga-exterior.jpg"
                        alt="Fachada de una comunidad conectada con Convive Connect"
                        fill
                        priority
                        sizes="50vw"
                        className="object-cover"
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{ background: "linear-gradient(135deg, rgba(20,17,13,0.92) 0%, rgba(20,17,13,0.72) 52%, rgba(20,17,13,0.9) 100%)" }}
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full blur-3xl"
                        style={{ background: "radial-gradient(circle, rgba(156, 86, 54,0.2) 0%, transparent 70%)" }}
                    />

                    <div className="relative z-10">
                        <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/10">
                            <Brand size={20} tone="inverse" withMark />
                        </Link>
                    </div>

                    <div className="relative z-10 my-auto max-w-md space-y-8">
                        <div className="space-y-4">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C99572]">BIENVENIDO</span>
                            <DisplayHeading size={44} style={{ color: "var(--cc-paper)" }}>
                                Gestiona tu comunidad <br />
                                con <em style={{ color: "var(--cc-copper-soft)", fontStyle: "italic" }}>control real.</em>
                            </DisplayHeading>
                            <p className="text-sm leading-relaxed text-[#EDE6D9]/82">
                                Accede a pagos, reservas de espacios, comunicación con conserjería y asambleas digitales en una sola interfaz limpia.
                            </p>
                        </div>

                        <div
                            className="relative translate-y-2 rotate-[-1deg] rounded-2xl border bg-[#110D0A]/88 p-5 shadow-2xl backdrop-blur-md"
                            style={{ borderColor: "rgba(250, 247, 241, 0.16)" }}
                        >
                            <div className="mb-3 flex items-center gap-2.5">
                                <div
                                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                                    style={{ background: "rgba(200, 160, 142, 0.15)", color: "var(--cc-copper-soft)" }}
                                >
                                    <Sparkles size={15} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-semibold tracking-wider text-[#C99572]">COCO AI</div>
                                    <div className="text-xs font-medium">Te está esperando</div>
                                </div>
                            </div>
                            <p className="text-xs leading-relaxed text-[#EDE6D9]/75">
                                &ldquo;Hola, he preparado el reporte mensual de gastos comunes. ¿Quieres que te lo envíe por correo?&rdquo;
                            </p>
                        </div>
                    </div>

                    <div className="relative z-10 text-xs text-[#EDE6D9]/55">
                        © 2026 Convive Connect. Todos los derechos reservados.
                    </div>
                </section>

                <section className="flex items-center justify-center overflow-y-auto p-6 sm:p-12">
                    <div className="w-full max-w-[400px] space-y-7">
                        <div className="flex items-start justify-between">
                            <div>
                                <Eyebrow className="mb-2">ACCESO</Eyebrow>
                                <DisplayHeading size={36}>
                                    Ingresa a tu <br />
                                    <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>comunidad.</em>
                                </DisplayHeading>
                            </div>
                            <Link href="/" className="grid h-9 w-9 place-items-center rounded-xl border transition-colors hover:bg-paper-warm" style={{ borderColor: "var(--cc-line)" }}>
                                <ArrowLeft size={16} />
                            </Link>
                        </div>

                        {pendingPasskeyDestination ? (
                            <div className="space-y-4 rounded-2xl border bg-[var(--cc-paper)] p-6 shadow-sm" style={{ borderColor: "var(--cc-line-strong)" }}>
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]">
                                    <ScanFace size={24} />
                                </div>
                                <div className="space-y-1.5">
                                    <h2 className="text-lg font-semibold text-[var(--cc-ink)]">Confirmar Face ID / huella en este celular</h2>
                                    <p className="text-xs leading-relaxed text-slate-600">
                                        Pulsa el botón para guardar tu llave biométrica en este teléfono. La próxima vez entrarás con un solo toque sin escribir tu contraseña.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { void handleActivatePasskeyNow(); }}
                                    disabled={enrollingPasskey}
                                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper transition-colors disabled:opacity-50"
                                    style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                                >
                                    {enrollingPasskey ? <Loader2 size={16} className="animate-spin" /> : <ScanFace size={18} />}
                                    {enrollingPasskey ? "Esperando confirmación..." : "Confirmar con Face ID / huella"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        router.replace(pendingPasskeyDestination);
                                        router.refresh();
                                    }}
                                    disabled={enrollingPasskey}
                                    className="w-full rounded-xl border px-4 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-paper-warm"
                                    style={{ borderColor: "var(--cc-line)" }}
                                >
                                    Ahora no, ir al inicio
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="hidden rounded-xl bg-[#EDE6D9] p-1" style={{ border: "1px solid var(--cc-line)" }}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("mail")}
                                        className="flex-1 rounded-lg py-2 text-center text-xs font-semibold transition-all"
                                        style={{
                                            background: activeTab === "mail" ? "var(--cc-paper)" : "transparent",
                                            color: activeTab === "mail" ? "var(--cc-ink)" : "var(--cc-ink-muted)",
                                            boxShadow: activeTab === "mail" ? "var(--cc-shadow-sm)" : "none",
                                        }}
                                    >
                                        Correo electrónico
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("rut")}
                                        className="flex-1 rounded-lg py-2 text-center text-xs font-semibold transition-all"
                                        style={{
                                            background: activeTab === "rut" ? "var(--cc-paper)" : "transparent",
                                            color: activeTab === "rut" ? "var(--cc-ink)" : "var(--cc-ink-muted)",
                                            boxShadow: activeTab === "rut" ? "var(--cc-shadow-sm)" : "none",
                                        }}
                                    >
                                        RUT chileno
                                    </button>
                                </div>

                                {checkEmail && (
                                    <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                                        <p>Revisa tu correo y abre el enlace de verificación antes de iniciar sesión.</p>
                                        <p className="mt-2 text-emerald-800">
                                            ¿No te llegó?{" "}
                                            <button
                                                type="button"
                                                onClick={handleResendConfirmation}
                                                disabled={resendState === "sending" || resendState === "sent"}
                                                className="underline underline-offset-2 font-medium disabled:no-underline disabled:opacity-70"
                                            >
                                                {resendState === "sending"
                                                    ? "Enviando…"
                                                    : resendState === "sent"
                                                        ? "Enlace reenviado"
                                                        : "Enviar de nuevo"}
                                            </button>
                                            {resendState === "idle" && !email && " (escribe tu correo arriba)"}
                                        </p>
                                    </div>
                                )}

                                {enrollOnSubmit && (
                                    <div role="status" className="rounded-xl border bg-[var(--cc-paper)] p-3.5 text-xs text-[var(--cc-ink)]" style={{ borderColor: "var(--cc-copper)" }}>
                                        <strong>Primera vez con Face ID en este celular:</strong> ingresa tu correo y contraseña una sola vez aquí abajo y pulsa <strong>Entrar y activar Face ID</strong>.
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label htmlFor="login-identity" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                            {activeTab === "mail" ? "CORREO ELECTRÓNICO" : "RUT DE USUARIO"}
                                        </label>
                                        <input
                                            ref={emailInputRef}
                                            id="login-identity"
                                            type={activeTab === "mail" ? "email" : "text"}
                                            inputMode={activeTab === "mail" ? "email" : "text"}
                                            autoComplete="username webauthn"
                                            value={email}
                                            onChange={(event) => setEmail(event.target.value)}
                                            placeholder={activeTab === "mail" ? "tu@correo.com" : "12.345.678-9"}
                                            required
                                            className="w-full rounded-xl border bg-[var(--cc-paper)] px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#9C5636]"
                                            style={{ borderColor: "var(--cc-line-strong)" }}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label htmlFor="login-password" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">CONTRASEÑA</label>
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
                                            id="login-password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            placeholder="Tu contraseña"
                                            required
                                            className="w-full rounded-xl border bg-[var(--cc-paper)] px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#9C5636]"
                                            style={{ borderColor: "var(--cc-line-strong)" }}
                                        />
                                    </div>

                                    {passkeySupported && (
                                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-[var(--cc-paper)] px-3.5 py-2.5 text-xs text-slate-600" style={{ borderColor: "var(--cc-line)" }}>
                                            <input
                                                type="checkbox"
                                                checked={enrollOnSubmit}
                                                onChange={(event) => setEnrollOnSubmit(event.target.checked)}
                                                className="mt-0.5 rounded"
                                            />
                                            <span>Activar Face ID, huella o PIN en este dispositivo al entrar</span>
                                        </label>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper transition-colors disabled:opacity-50"
                                        style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                                    >
                                        {loading ? "Entrando..." : enrollOnSubmit ? "Entrar y activar Face ID" : "Entrar"}
                                        <ArrowRight size={15} />
                                    </button>
                                </form>

                                {passkeySupported && (
                                    <div className="space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => { void handlePasskeySignIn(); }}
                                            disabled={loading}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-paper px-4 py-3 text-sm font-semibold transition-colors hover:bg-paper-warm disabled:opacity-50"
                                            style={{ borderColor: "var(--cc-line-strong)", color: "var(--cc-ink)" }}
                                        >
                                            <ScanFace size={18} /> Entrar con Face ID, huella o PIN
                                        </button>
                                        <p className="text-center text-xs text-slate-500">
                                            Si es tu primera vez en este celular, marca la opción de arriba o ingresa tu correo y contraseña y pulsa este botón.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="relative my-6 flex items-center justify-center">
                            <div className="absolute w-full border-t" style={{ borderColor: "var(--cc-line-strong)" }} />
                            <span className="relative bg-paper-warm px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ background: "var(--cc-ivory)" }}>
                                O continúa con
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {["Google", "Apple", "Clave Única"].map((provider) => (
                                <button
                                    key={provider}
                                    type="button"
                                    disabled
                                    title={`${provider} se activa por contrato del condominio`}
                                    className="cursor-not-allowed rounded-xl border bg-paper px-2 py-2.5 text-center text-xs font-semibold opacity-55"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                >
                                    {provider}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <Link href="/resident-access" className="text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
                                ¿Eres residente? <span className="text-copper underline">Entrar con mi correo</span>
                            </Link>
                            <Link href="/signup" className="text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
                                ¿Tienes un código de invitación? <span className="text-copper underline">Crear cuenta</span>
                            </Link>
                            <Link href="/admin-onboarding" className="text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
                                ¿Eres administrador? <span className="text-copper underline">Registrar edificio</span>
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
