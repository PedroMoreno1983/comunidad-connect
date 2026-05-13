"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandWordmark } from "@/components/BrandWordmark";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Lock, Mail, ShieldCheck, UserRoundCheck, Users } from "lucide-react";

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
    const { signIn, loginDemo } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await signIn(email, password);

        if (error) {
            toast({
                title: "Error al iniciar sesion",
                description: error.message || "Verifica tus credenciales",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        toast({
            title: "Bienvenido",
            description: "Has iniciado sesion correctamente",
            variant: "success",
        });
        router.push("/");
    };

    const handleDemoLogin = async (_demoEmail: string, _demoPass: string, role: string) => {
        setLoading(true);
        loginDemo(role as "admin" | "resident" | "concierge");
        toast({ title: "Entrando a la demo", description: "Has iniciado sesion", variant: "success" });
        router.push("/");
    };

    return (
        <main className="min-h-screen bg-canvas px-4 py-8">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
                <section className="hidden space-y-8 lg:block">
                    <Link href="/" className="inline-flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white">
                            <Building2 className="h-5 w-5" />
                        </span>
                        <BrandWordmark className="text-xl cc-text-primary" />
                    </Link>

                    <div className="max-w-xl space-y-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Operacion comunitaria</p>
                        <h1 className="text-5xl font-semibold leading-tight cc-text-primary">Administra tu comunidad con control real.</h1>
                        <p className="text-lg leading-8 cc-text-secondary">
                            Entra al panel para revisar pagos, reservas, conserjeria, mantenimiento, casos CoCo y reportes sin cambiar de sistema.
                        </p>
                    </div>

                    <div className="grid max-w-2xl grid-cols-3 gap-3">
                        {["Demo protegida", "Roles separados", "Datos auditables"].map((item) => (
                            <div key={item} className="rounded-lg border border-subtle bg-surface p-4">
                                <UserRoundCheck className="mb-3 h-5 w-5 text-brand-500" />
                                <p className="text-sm font-semibold cc-text-primary">{item}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm sm:p-8">
                    <div className="mb-8 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Acceso</p>
                            <h2 className="mt-2 text-3xl font-semibold cc-text-primary">Iniciar sesion</h2>
                            <p className="mt-2 text-sm cc-text-secondary">Usa tus credenciales o entra a una demo segura.</p>
                        </div>
                        <Link href="/" className="rounded-lg border border-subtle p-2.5 cc-text-secondary transition-colors hover:bg-elevated" aria-label="Volver al inicio">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="mb-2 block text-sm font-semibold cc-text-primary">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required className="pl-10" />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="mb-2 block text-sm font-semibold cc-text-primary">Contrasena</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contrasena" required className="pl-10 pr-10" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}>
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        <Button type="submit" disabled={loading} className="w-full" trailingIcon={<ArrowRight className="h-4 w-4" />}>
                            {loading ? "Entrando..." : "Entrar"}
                        </Button>
                    </form>

                    <div className="my-6 h-px bg-[var(--cc-border-subtle)]" />

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold cc-text-primary">Acceso demo</h3>
                            <span className="rounded-md bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">Sin envios reales</span>
                        </div>
                        {DEMO_ACCOUNTS.map(({ label, email: demoEmail, role, icon: Icon }) => (
                            <button
                                key={demoEmail}
                                type="button"
                                onClick={() => handleDemoLogin(demoEmail, "demo123", role)}
                                disabled={loading}
                                className="flex w-full items-center justify-between rounded-lg border border-subtle bg-canvas px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                            >
                                <span className="flex items-center gap-3">
                                    <Icon className="h-4 w-4 text-brand-500" />
                                    <span className="text-sm font-semibold cc-text-primary">{label}</span>
                                </span>
                                <ArrowRight className="h-4 w-4 cc-text-tertiary" />
                            </button>
                        ))}
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <Link href="/signup" className="rounded-lg border border-subtle px-4 py-3 text-center text-sm font-semibold cc-text-primary transition-colors hover:bg-elevated">
                            Crear cuenta
                        </Link>
                        <Link href="/admin-onboarding" className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100">
                            Registrar edificio
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
