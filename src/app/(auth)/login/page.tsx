"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { isDemoModeEnabled } from "@/lib/runtimeMode";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, ShieldCheck, Users, Sparkles } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";

const DEMO_ACCOUNTS = [
    { label: "Administrador", email: "admin@demo.com", role: "admin", icon: Building2 },
    { label: "Conserje", email: "conserje@demo.com", role: "concierge", icon: ShieldCheck },
    { label: "Residente", email: "residente@demo.com", role: "resident", icon: Users },
];

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"mail" | "rut">("mail");
    const { signIn, loginDemo } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const demoEnabled = isDemoModeEnabled();

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

    const handleDemoLogin = async (_demoEmail: string, _demoPass: string, role: string) => {
        setLoading(true);
        try {
            loginDemo(role as "admin" | "resident" | "concierge");
            toast({ title: "Entrando al showcase", description: "Has iniciado sesión", variant: "success" });
            router.push("/home");
        } catch (error) {
            toast({
                title: "Showcase no disponible",
                description: error instanceof Error ? error.message : "Este entorno acepta solo usuarios reales.",
                variant: "destructive",
            });
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex" style={{ background: "var(--cc-ivory)" }}>
            <div className="grid w-full lg:grid-cols-2">
                {/* Left side: Onboarding Hero (hidden on mobile) */}
                <section 
                  className="hidden lg:flex flex-col relative overflow-hidden p-12 justify-between"
                  style={{
                    background: "linear-gradient(135deg, #1A1611 0%, #2D241D 100%)",
                    color: "var(--cc-paper)"
                  }}
                >
                    {/* Warm ambient light */}
                    <div 
                      aria-hidden 
                      className="absolute top-1/4 right-0 w-[400px] h-[400px] rounded-full blur-3xl pointer-events-none"
                      style={{ background: "radial-gradient(circle, rgba(181,102,78,0.2) 0%, transparent 70%)" }}
                    />

                    <div className="relative z-10">
                        <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/10">
                            <Brand size={20} tone="inverse" withMark />
                        </Link>
                    </div>

                    <div className="relative z-10 max-w-md my-auto space-y-8">
                        <div className="space-y-4">
                            <span className="text-[10px] font-semibold tracking-widest text-[#D9A691] uppercase">BIENVENIDO</span>
                            <DisplayHeading size={44} style={{ color: "var(--cc-paper)" }}>
                                Gestiona tu comunidad <br />
                                con <em style={{ color: "var(--cc-copper-soft)", fontStyle: "italic" }}>control real.</em>
                            </DisplayHeading>
                            <p className="text-sm leading-relaxed text-[#EDE6D9]/82">
                                Accede a pagos, reservas de espacios, comunicación con conserjería y asambleas digitales en una sola interfaz limpia.
                            </p>
                        </div>

                        {/* Floating Card Mockup */}
                        <div 
                          className="rounded-2xl border p-5 shadow-2xl bg-[#110D0A]/88 backdrop-blur-md relative transform rotate-[-1deg] translate-y-2"
                          style={{ borderColor: "rgba(250, 247, 241, 0.16)" }}
                        >
                            <div className="flex items-center gap-2.5 mb-3">
                                <div 
                                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                                  style={{ background: "rgba(217, 166, 145, 0.15)", color: "var(--cc-copper-soft)" }}
                                >
                                    <Sparkles size={15} />
                                </div>
                                <div>
                                    <div className="text-[10px] tracking-wider text-[#D9A691] font-semibold">COCO AI</div>
                                    <div className="text-xs font-medium">Te está esperando</div>
                                </div>
                            </div>
                            <p className="text-xs leading-relaxed text-[#EDE6D9]/75">
                                &ldquo;Hola, he preparado el reporte mensual de gastos comunes. ¿Quieres que te lo envíe por correo?&rdquo;
                            </p>
                        </div>

                        {/* Pagination Dots */}
                        <div className="flex gap-1.5 pt-4">
                            <span className="w-6 h-1.5 rounded-full" style={{ background: "var(--cc-copper)" }} />
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(250,247,241,0.2)" }} />
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(250,247,241,0.2)" }} />
                        </div>
                    </div>

                    <div className="relative z-10 text-xs text-[#EDE6D9]/55">
                        © 2026 Convive Connect. Todos los derechos reservados.
                    </div>
                </section>

                {/* Right side: Login Form */}
                <section className="flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
                    <div className="w-full max-w-[400px] space-y-7">
                        <div className="flex justify-between items-start">
                            <div>
                                <Eyebrow className="mb-2">ACCESO</Eyebrow>
                                <DisplayHeading size={36}>
                                    Ingresa a tu <br />
                                    <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>comunidad.</em>
                                </DisplayHeading>
                            </div>
                            <Link href="/" className="grid place-items-center w-9 h-9 rounded-xl border transition-colors hover:bg-paper-warm" style={{ borderColor: "var(--cc-line)" }}>
                                <ArrowLeft size={16} />
                            </Link>
                        </div>

                        {/* Mail / RUT segmented tabs */}
                        <div className="p-1 rounded-xl bg-[#EDE6D9] flex" style={{ border: "1px solid var(--cc-line)" }}>
                            <button
                                type="button"
                                onClick={() => setActiveTab("mail")}
                                className="flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all"
                                style={{
                                    background: activeTab === "mail" ? "var(--cc-paper)" : "transparent",
                                    color: activeTab === "mail" ? "var(--cc-ink)" : "var(--cc-ink-muted)",
                                    boxShadow: activeTab === "mail" ? "var(--cc-shadow-sm)" : "none"
                                }}
                            >
                                Correo Electrónico
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("rut")}
                                className="flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all"
                                style={{
                                    background: activeTab === "rut" ? "var(--cc-paper)" : "transparent",
                                    color: activeTab === "rut" ? "var(--cc-ink)" : "var(--cc-ink-muted)",
                                    boxShadow: activeTab === "rut" ? "var(--cc-shadow-sm)" : "none"
                                }}
                            >
                                RUT Chileno
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">
                                    {activeTab === "mail" ? "CORREO ELECTRÓNICO" : "RUT DE USUARIO"}
                                </label>
                                <input
                                    type={activeTab === "mail" ? "email" : "text"}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={activeTab === "mail" ? "tu@correo.com" : "12.345.678-9"}
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">CONTRASEÑA</label>
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
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Tu contraseña"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 bg-ink text-paper text-sm font-semibold rounded-xl inline-flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                                style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                            >
                                {loading ? "Entrando..." : "Entrar"}
                                <ArrowRight size={15} />
                            </button>
                        </form>

                        {/* Social Buttons divider */}
                        <div className="relative flex items-center justify-center my-6">
                            <div className="absolute w-full border-t" style={{ borderColor: "var(--cc-line-strong)" }} />
                            <span className="relative px-3 text-[10px] font-semibold tracking-wider text-slate-400 uppercase bg-paper-warm" style={{ background: "var(--cc-ivory)" }}>
                                O continúa con
                            </span>
                        </div>

                        {/* Social login buttons */}
                        <div className="grid grid-cols-3 gap-2">
                            {["Google", "Apple", "Clave Única"].map((prov) => (
                                <button
                                    key={prov}
                                    type="button"
                                    onClick={() => {
                                        toast({ title: "Acceso con " + prov, description: "Este proveedor se habilita por comunidad.", variant: "default" });
                                    }}
                                    className="py-2.5 px-2 text-center text-xs font-semibold rounded-xl bg-paper border hover:bg-paper-warm transition-colors"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                >
                                    {prov}
                                </button>
                            ))}
                        </div>

                        {/* Demo login accounts */}
                        {demoEnabled && (
                            <div className="space-y-2.5 pt-4 border-t" style={{ borderColor: "var(--cc-line-strong)" }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">ACCESO SHOWCASE INTERNO</span>
                                    <span className="px-2 py-0.5 rounded bg-[#FAF7F1] text-[9px] font-bold text-copper border" style={{ borderColor: "var(--cc-line-strong)" }}>DATOS PROTEGIDOS</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {DEMO_ACCOUNTS.map(({ label, email: demoEmail, role }) => (
                                        <button
                                            key={demoEmail}
                                            type="button"
                                            onClick={() => handleDemoLogin(demoEmail, "demo123", role)}
                                            disabled={loading}
                                            className="py-2 px-1 text-center text-[11px] font-semibold rounded-xl border bg-paper text-[#B5664E] hover:bg-paper-warm transition-colors"
                                            style={{ borderColor: "var(--cc-line-strong)" }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-2 flex flex-col gap-2">
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
