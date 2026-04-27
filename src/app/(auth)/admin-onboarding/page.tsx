"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase";
import { Building, Mail, Lock, User, Eye, EyeOff, CheckCircle, Star, Zap, Crown } from "lucide-react";

const PLANS = [
    {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Básico",
        price: "$19.990",
        unit: "+ $490 / unidad/mes",
        icon: Star,
        color: "blue",
        features: [
            "✅ Muro y Avisos",
            "✅ Directorio Vecinal",
            "✅ Conserjería Digital",
            "✅ Espacios Comunes",
            "✅ Control de Visitas",
            "❌ Mantenimiento",
            "❌ Votaciones",
            "❌ CoCo IA",
        ],
    },
    {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Avanzado",
        price: "$34.990",
        unit: "+ $690 / unidad/mes",
        icon: Zap,
        color: "indigo",
        badge: "Más popular",
        features: [
            "✅ Todo lo del Básico",
            "✅ Mantenimiento",
            "✅ Votaciones Online",
            "✅ Pagos Online",
            "✅ Reportes Financieros",
            "❌ CoCo IA",
        ],
    },
    {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Premium",
        price: "$49.990",
        unit: "+ $990 / unidad/mes",
        icon: Crown,
        color: "purple",
        features: [
            "✅ Todo lo del Avanzado",
            "✅ CoCo IA Assistant",
            "✅ Aula Virtual",
            "✅ Integraciones",
            "✅ Soporte Prioritario",
        ],
    },
];

const STEP_LABELS = ["Selecciona tu Plan", "Datos del Condominio", "Tu Cuenta"];

export default function AdminOnboardingPage() {
    const [step, setStep] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
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
            toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
            return;
        }
        if (password.length < 6) {
            toast({ title: "Error", description: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
            return;
        }
        if (!communityName.trim()) {
            toast({ title: "Error", description: "Debes ingresar el nombre del Condominio", variant: "destructive" });
            return;
        }

        setLoading(true);

        try {
            // 1. Sign up user
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name: fullName, role: "admin" },
                },
            });

            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error("No se pudo crear el usuario");

            // 2. If no session (email confirmation required), redirect to login
            if (!authData.session) {
                toast({
                    title: "¡Cuenta creada!",
                    description: "Revisa tu correo para confirmar tu cuenta y luego inicia sesión.",
                    variant: "success",
                });
                router.push("/login");
                return;
            }

            // 3. Create community with selected plan tier
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

            // 4. Link profile to community
            const { error: profileError } = await supabase
                .from("profiles")
                .update({ community_id: communityData.id, role: "admin" })
                .eq("id", authData.user.id);

            if (profileError) throw profileError;

            // Notify SuperAdmin (fire and forget — don't block the user)
            const selectedPlanName = PLANS.find(p => p.id === selectedPlan)?.name || 'Sin plan';
            fetch('/api/email/new-community', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    communityName: communityName.trim(),
                    address,
                    planName: selectedPlanName,
                    adminEmail: email,
                    adminName: fullName,
                }),
            }).catch(console.error);

            toast({
                title: "¡Comunidad creada!",
                description: `Bienvenido a la administración de ${communityName}`,
                variant: "success",
            });
            router.push("/home");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Ocurrió un error inesperado";
            toast({ title: "Error en el registro", description: message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const colorMap: Record<string, string> = {
        blue: "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
        indigo: "border-brand-500 bg-brand-50 dark:bg-indigo-900/20",
        purple: "border-brand-500 bg-brand-50 dark:bg-purple-900/20",
    };
    const iconColorMap: Record<string, string> = {
        blue: "text-blue-500",
        indigo: "text-brand-500",
        purple: "text-brand-500",
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white text-2xl font-bold mb-4 shadow-lg">
                        CC
                    </div>
                    <h1 className="text-3xl font-bold cc-text-primary mb-2">
                        Registra tu Condominio
                    </h1>
                    <p className="cc-text-secondary">
                        Empieza gratis con 30 días de prueba
                    </p>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {STEP_LABELS.map((label, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                i === step
                                    ? "bg-brand-600 text-white"
                                    : i < step
                                    ? "bg-green-500 text-white"
                                    : "bg-elevated text-slate-500"
                            }`}>
                                {i < step ? <CheckCircle className="h-4 w-4" /> : <span>{i + 1}</span>}
                                <span className="hidden sm:inline">{label}</span>
                            </div>
                            {i < STEP_LABELS.length - 1 && (
                                <div className={`w-8 h-0.5 ${i < step ? "bg-green-500" : "bg-elevated"}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step 0: Plan Selection */}
                {step === 0 && (
                    <div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                            {PLANS.map((plan) => {
                                const Icon = plan.icon;
                                const isSelected = selectedPlan === plan.id;
                                return (
                                    <div
                                        key={plan.id}
                                        onClick={() => setSelectedPlan(plan.id)}
                                        className={`relative cursor-pointer rounded-2xl border-2 p-5 transition-all ${
                                            isSelected
                                                ? colorMap[plan.color]
                                                : "border-subtle bg-surface hover:border-slate-300"
                                        }`}
                                    >
                                        {plan.badge && (
                                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                                                {plan.badge}
                                            </div>
                                        )}
                                        <div className={`mb-3 ${iconColorMap[plan.color]}`}>
                                            <Icon className="h-7 w-7" />
                                        </div>
                                        <h3 className="text-lg font-bold cc-text-primary mb-1">{plan.name}</h3>
                                        <p className="text-2xl font-bold cc-text-primary">{plan.price}</p>
                                        <p className="text-xs text-slate-500 mb-4">{plan.unit}</p>
                                        <ul className="space-y-1">
                                            {plan.features.map((f, i) => (
                                                <li key={i} className="text-xs cc-text-secondary">{f}</li>
                                            ))}
                                        </ul>
                                        {isSelected && (
                                            <div className="absolute top-3 right-3">
                                                <CheckCircle className="h-5 w-5 text-green-500" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setSelectedPlan(null); setStep(1); }}
                                className="flex-1"
                            >
                                Decidir después
                            </Button>
                            <Button
                                type="button"
                                disabled={!selectedPlan}
                                onClick={() => setStep(1)}
                                className="flex-1 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700"
                            >
                                Continuar →
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 1: Community Info */}
                {step === 1 && (
                    <div className="bg-surface rounded-2xl shadow-xl border border-subtle p-8">
                        <h2 className="text-xl font-bold cc-text-primary mb-6 flex items-center gap-2">
                            <Building className="h-5 w-5 text-brand-500" />
                            Datos del Condominio
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold cc-text-secondary mb-2">
                                    Nombre del Condominio *
                                </label>
                                <Input
                                    type="text"
                                    value={communityName}
                                    onChange={(e) => setCommunityName(e.target.value)}
                                    placeholder="Ej: Edificio Los Pinos"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold cc-text-secondary mb-2">
                                    Dirección
                                </label>
                                <Input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Ej: Av. Providencia 1234, Santiago"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold cc-text-secondary mb-2">
                                    N° de Unidades / Departamentos
                                </label>
                                <Input
                                    type="number"
                                    value={units}
                                    onChange={(e) => setUnits(e.target.value)}
                                    placeholder="Ej: 80"
                                    min="1"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <Button type="button" variant="outline" onClick={() => setStep(0)} className="flex-1">
                                ← Volver
                            </Button>
                            <Button
                                type="button"
                                disabled={!communityName.trim()}
                                onClick={() => setStep(2)}
                                className="flex-1 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700"
                            >
                                Continuar →
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 2: Account Info */}
                {step === 2 && (
                    <div className="bg-surface rounded-2xl shadow-xl border border-subtle p-8">
                        <h2 className="text-xl font-bold cc-text-primary mb-6 flex items-center gap-2">
                            <User className="h-5 w-5 text-brand-500" />
                            Tu Cuenta de Administrador
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Tu Nombre Completo"
                                    required
                                    className="pl-10"
                                />
                            </div>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@email.com"
                                    required
                                    className="pl-10"
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Contraseña (mínimo 6 caracteres)"
                                    required
                                    className="pl-10 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirma tu contraseña"
                                    required
                                    className="pl-10"
                                />
                            </div>

                            {/* Summary */}
                            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-sm cc-text-secondary space-y-1">
                                <p><span className="font-semibold">Condominio:</span> {communityName}</p>
                                {address && <p><span className="font-semibold">Dirección:</span> {address}</p>}
                                <p><span className="font-semibold">Plan:</span> {PLANS.find(p => p.id === selectedPlan)?.name || "Por definir"}</p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                                    ← Volver
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700"
                                >
                                    {loading ? "Creando..." : "🚀 Registrar Condominio"}
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="text-center mt-6">
                    <Link
                        href="/login"
                        className="text-sm cc-text-secondary hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                        ← Ya tengo cuenta, Iniciar Sesión
                    </Link>
                </div>
            </div>
        </div>
    );
}
