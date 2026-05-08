"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Crown, Eye, EyeOff, Lock, Mail, Star, User, Zap } from "lucide-react";

const PLANS = [
    {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Basico",
        price: "$19.990",
        unit: "+ $490 / unidad/mes",
        icon: Star,
        features: ["Muro y avisos", "Directorio vecinal", "Conserjeria digital", "Espacios comunes", "Control de visitas"],
    },
    {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Avanzado",
        price: "$34.990",
        unit: "+ $690 / unidad/mes",
        icon: Zap,
        badge: "Recomendado",
        features: ["Todo lo del Basico", "Mantenimiento", "Votaciones online", "Pagos online", "Reportes financieros"],
    },
    {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Premium",
        price: "$49.990",
        unit: "+ $990 / unidad/mes",
        icon: Crown,
        features: ["Todo lo del Avanzado", "CoCo IA Assistant", "Aula virtual", "Integraciones", "Soporte prioritario"],
    },
];

const STEP_LABELS = ["Plan", "Condominio", "Cuenta"];

export default function AdminOnboardingPage() {
    const [step, setStep] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(PLANS[1].id);
    const [communityName, setCommunityName] = useState("");
    const [address, setAddress] = useState("");
    const [units, setUnits] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast({ title: "Error", description: "Las contrasenas no coinciden", variant: "destructive" });
            return;
        }
        if (password.length < 6) {
            toast({ title: "Error", description: "La contrasena debe tener al menos 6 caracteres", variant: "destructive" });
            return;
        }
        if (!communityName.trim()) {
            toast({ title: "Error", description: "Debes ingresar el nombre del condominio", variant: "destructive" });
            return;
        }

        setLoading(true);

        try {
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name: fullName, role: "admin" },
                },
            });

            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error("No se pudo crear el usuario");

            if (!authData.session) {
                toast({
                    title: "Cuenta creada",
                    description: "Revisa tu correo para confirmar la cuenta y luego inicia sesion.",
                    variant: "success",
                });
                router.push("/login");
                return;
            }

            const communityPayload: Record<string, unknown> = {
                name: communityName.trim(),
                subscription_status: "trialing",
            };
            if (address) communityPayload.address = address;
            if (selectedPlan) communityPayload.tier_id = selectedPlan;

            const { data: communityData, error: commError } = await supabase
                .from("communities")
                .insert(communityPayload)
                .select("id")
                .single();

            if (commError) throw commError;

            const { error: profileError } = await supabase
                .from("profiles")
                .update({ community_id: communityData.id, role: "admin" })
                .eq("id", authData.user.id);

            if (profileError) throw profileError;

            const selectedPlanName = PLANS.find(p => p.id === selectedPlan)?.name || "Por definir";
            fetch("/api/email/new-community", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    communityName: communityName.trim(),
                    address,
                    planName: selectedPlanName,
                    adminEmail: email,
                    adminName: fullName,
                }),
            }).catch(console.error);

            toast({
                title: "Comunidad creada",
                description: `Bienvenido a la administracion de ${communityName}`,
                variant: "success",
            });
            router.push("/home");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Ocurrio un error inesperado";
            toast({ title: "Error en el registro", description: message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-canvas px-4 py-8">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[420px_1fr]">
                <aside className="hidden space-y-8 lg:block">
                    <Link href="/" className="inline-flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white">
                            <Building2 className="h-5 w-5" />
                        </span>
                        <span className="text-xl font-semibold cc-text-primary">Comunidad<span className="text-brand-500">Connect</span></span>
                    </Link>
                    <div className="space-y-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Alta administradores</p>
                        <h1 className="text-5xl font-semibold leading-tight cc-text-primary">Configura tu comunidad sin improvisar.</h1>
                        <p className="text-lg leading-8 cc-text-secondary">
                            El onboarding crea la comunidad, vincula el perfil admin y deja listo el plan inicial para operar con datos reales.
                        </p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-surface p-5">
                        <p className="text-sm font-semibold cc-text-primary">Incluye 30 dias de prueba</p>
                        <p className="mt-2 text-sm leading-6 cc-text-secondary">Puedes partir con datos base y activar cobros, reservas o CoCo IA cuando el edificio este listo.</p>
                    </div>
                </aside>

                <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm sm:p-8">
                    <div className="mb-8 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Registro</p>
                            <h2 className="mt-2 text-3xl font-semibold cc-text-primary">Registra tu condominio</h2>
                            <p className="mt-2 text-sm cc-text-secondary">Completa los datos minimos para crear el espacio administrativo.</p>
                        </div>
                        <Link href="/login" className="rounded-lg border border-subtle p-2.5 cc-text-secondary transition-colors hover:bg-elevated" aria-label="Volver al login">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </div>

                    <div className="mb-8 grid grid-cols-3 gap-2">
                        {STEP_LABELS.map((label, index) => (
                            <div key={label} className={`rounded-lg border px-3 py-2 ${index === step ? "border-brand-500 bg-brand-50" : index < step ? "border-emerald-200 bg-emerald-50" : "border-subtle bg-canvas"}`}>
                                <div className="flex items-center gap-2">
                                    {index < step ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="text-xs font-semibold cc-text-tertiary">{index + 1}</span>}
                                    <span className="text-xs font-semibold cc-text-primary">{label}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {step === 0 && (
                        <div className="space-y-5">
                            <div className="grid gap-3 lg:grid-cols-3">
                                {PLANS.map((plan) => {
                                    const Icon = plan.icon;
                                    const isSelected = selectedPlan === plan.id;
                                    return (
                                        <button
                                            key={plan.id}
                                            type="button"
                                            onClick={() => setSelectedPlan(plan.id)}
                                            className={`relative rounded-lg border p-4 text-left transition-colors ${isSelected ? "border-brand-500 bg-brand-50" : "border-subtle bg-canvas hover:border-brand-300"}`}
                                        >
                                            {plan.badge && (
                                                <span className="mb-3 inline-flex rounded-md bg-brand-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                                                    {plan.badge}
                                                </span>
                                            )}
                                            <Icon className="mb-3 h-5 w-5 text-brand-500" />
                                            <h3 className="font-semibold cc-text-primary">{plan.name}</h3>
                                            <p className="mt-2 text-2xl font-semibold cc-text-primary">{plan.price}</p>
                                            <p className="mt-1 text-xs cc-text-secondary">{plan.unit}</p>
                                            <ul className="mt-4 space-y-2">
                                                {plan.features.map((feature) => (
                                                    <li key={feature} className="flex gap-2 text-xs cc-text-secondary">
                                                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
                                                        <span>{feature}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            {isSelected && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-brand-600" />}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button type="button" variant="outline" onClick={() => { setSelectedPlan(null); setStep(1); }}>
                                    Decidir despues
                                </Button>
                                <Button type="button" disabled={!selectedPlan} onClick={() => setStep(1)} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                                    Continuar
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-5">
                            <Field label="Nombre del condominio" required>
                                <Input type="text" value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="Edificio Los Pinos" required />
                            </Field>
                            <Field label="Direccion">
                                <Input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Providencia 1234, Santiago" />
                            </Field>
                            <Field label="Numero de unidades">
                                <Input type="number" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="80" min="1" />
                            </Field>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button type="button" variant="outline" onClick={() => setStep(0)}>Volver</Button>
                                <Button type="button" disabled={!communityName.trim()} onClick={() => setStep(2)} trailingIcon={<ArrowRight className="h-4 w-4" />}>Continuar</Button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <IconField icon={<User className="h-5 w-5" />}>
                                <Input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre completo" required className="pl-10" />
                            </IconField>
                            <IconField icon={<Mail className="h-5 w-5" />}>
                                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required className="pl-10" />
                            </IconField>
                            <IconField icon={<Lock className="h-5 w-5" />}>
                                <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contrasena, minimo 6 caracteres" required className="pl-10 pr-10" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}>
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </IconField>
                            <IconField icon={<Lock className="h-5 w-5" />}>
                                <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirma tu contrasena" required className="pl-10" />
                            </IconField>

                            <div className="rounded-lg border border-subtle bg-canvas p-4 text-sm">
                                <p className="font-semibold cc-text-primary">{communityName || "Condominio por definir"}</p>
                                {address && <p className="mt-1 cc-text-secondary">{address}</p>}
                                <p className="mt-1 cc-text-secondary">Plan: {PLANS.find(p => p.id === selectedPlan)?.name || "Por definir"}</p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button type="button" variant="outline" onClick={() => setStep(1)}>Volver</Button>
                                <Button type="submit" disabled={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                                    {loading ? "Creando..." : "Registrar condominio"}
                                </Button>
                            </div>
                        </form>
                    )}
                </section>
            </div>
        </main>
    );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-semibold cc-text-primary">
                {label}{required ? " *" : ""}
            </label>
            {children}
        </div>
    );
}

function IconField({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
            {children}
        </div>
    );
}
