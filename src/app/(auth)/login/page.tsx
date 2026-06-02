"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"mail" | "rut">("mail");
    const { signIn } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);

        const { error } = await signIn(email, password);

        if (error) {
            toast({
                title: "Error al iniciar sesión",
                description: error.message || "Verifica tus credenciales",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        toast({
            title: "Bienvenido",
            description: "Has iniciado sesión correctamente",
            variant: "success",
        });
        router.push("/home");
    };

    return (
        <main className="flex min-h-screen" style={{ background: "var(--cc-ivory)" }}>
            <div className="grid w-full lg:grid-cols-2">
                <section
                    className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
                    style={{
                        background: "linear-gradient(135deg, #1A1611 0%, #2D241D 100%)",
                        color: "var(--cc-paper)",
                    }}
                >
                    <div
                        aria-hidden
                        className="pointer-events-none absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full blur-3xl"
                        style={{ background: "radial-gradient(circle, rgba(181,102,78,0.2) 0%, transparent 70%)" }}
                    />

                    <div className="relative z-10">
                        <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/10">
                            <Brand size={20} tone="inverse" withMark />
                        </Link>
                    </div>

                    <div className="relative z-10 my-auto max-w-md space-y-8">
                        <div className="space-y-4">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#D9A691]">BIENVENIDO</span>
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
                                    style={{ background: "rgba(217, 166, 145, 0.15)", color: "var(--cc-copper-soft)" }}
                                >
                                    <Sparkles size={15} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-semibold tracking-wider text-[#D9A691]">COCO AI</div>
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

                        <div className="flex rounded-xl bg-[#EDE6D9] p-1" style={{ border: "1px solid var(--cc-line)" }}>
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

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                    {activeTab === "mail" ? "CORREO ELECTRÓNICO" : "RUT DE USUARIO"}
                                </label>
                                <input
                                    type={activeTab === "mail" ? "email" : "text"}
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder={activeTab === "mail" ? "tu@correo.com" : "12.345.678-9"}
                                    required
                                    className="w-full rounded-xl border bg-[#FAF7F1] px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#B5664E]"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">CONTRASEÑA</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-xs font-medium text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Tu contraseña"
                                    required
                                    className="w-full rounded-xl border bg-[#FAF7F1] px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#B5664E]"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-paper transition-colors disabled:opacity-50"
                                style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                            >
                                {loading ? "Entrando..." : "Entrar"}
                                <ArrowRight size={15} />
                            </button>
                        </form>

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
                            <Link href="/signup" className="text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
                                ¿No tienes cuenta? <span className="text-copper underline">Crear cuenta</span>
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
