"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Building, MapPin, CheckCircle2, ChevronRight, ChevronLeft, Building2 } from "lucide-react";

// Types based on the DB Schema
interface PricingTier {
    id: string;
    name: string;
    price_per_unit: number;
    base_price: number;
    features: Record<string, boolean>;
}

export default function OnboardingPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { logout } = useAuth(); // ensure clean state

    // Wizard State
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [tiers, setTiers] = useState<PricingTier[]>([]);

    // Form State
    const [communityName, setCommunityName] = useState("");
    const [communityAddress, setCommunityAddress] = useState("");
    const [selectedTierId, setSelectedTierId] = useState<string>("");
    const [adminName, setAdminName] = useState("");
    const [adminEmail, setAdminEmail] = useState("");
    const [adminPassword, setAdminPassword] = useState("");

    // Fetch pricing tiers on load
    useEffect(() => {
        const fetchTiers = async () => {
            const { data, error } = await supabase
                .from("pricing_tiers")
                .select("*")
                .order("price_per_unit", { ascending: true });

            if (!error && data) {
                setTiers(data);
            }
        };
        fetchTiers();
    }, []);

    const nextStep = () => setStep((s) => Math.min(s + 1, 3));
    const prevStep = () => setStep((s) => Math.max(s - 1, 1));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // STEP 1: Sign Up the Admin User (Creates Auth User + Trigger creates public.profiles)
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: adminEmail,
                password: adminPassword,
                options: {
                    data: {
                        name: adminName,
                        role: "admin",
                        // Note: If community_id is not passed, the trigger defaults to the Demo Community.
                    }
                }
            });

            if (authError) throw new Error(authError.message);
            if (!authData.user) throw new Error("No se pudo crear el usuario");

            // STEP 2: The user is now officially 'authenticated'. We can insert the community.
            const { data: newCommunity, error: commError } = await supabase
                .from("communities")
                .insert({
                    name: communityName,
                    address: communityAddress,
                    tier_id: selectedTierId,
                    subscription_status: 'trialing' // 14-day free trial paradigm
                })
                .select()
                .single();

            if (commError) throw new Error("Error al crear la comunidad: " + commError.message);

            // STEP 3: Relink the Profile to the newly created Community and ensure Admin role
            const { error: profileError } = await supabase
                .from("profiles")
                .update({
                    community_id: newCommunity.id,
                    role: "admin",
                    name: adminName
                })
                .eq("id", authData.user.id);

            if (profileError) {
                console.error("Profile linking error:", profileError);
                // Non-fatal, but needs logging
            }

            toast({
                title: "¡Comunidad Creada!",
                description: "Tu panel de administración está listo.",
                variant: "success",
            });

            // Redirect to Dashboard (the session is already active!)
            router.push("/");

        } catch (error: any) {
            toast({
                title: "Error en el registro",
                description: error.message || "Ocurrió un error inesperado",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 flex flex-col items-center p-4 py-12">

            {/* Header */}
            <div className="text-center mb-10 w-full max-w-3xl">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-2xl font-bold mb-4 shadow-lg">
                    CC
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                    Comienza con ComunidadConnect
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-300">
                    Crea tu condominio digital en 3 simples pasos. Sin tarjeta de crédito inicial.
                </p>
            </div>

            {/* Stepper Wizard Container */}
            <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-10">

                {/* Progress Indicators */}
                <div className="flex items-center justify-between mb-8">
                    {[1, 2, 3].map((num) => (
                        <div key={num} className="flex flex-col items-center relative z-10">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= num ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                                {step > num ? <CheckCircle2 className="w-6 h-6" /> : num}
                            </div>
                            <span className={`mt-2 text-xs font-semibold ${step >= num ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                                {num === 1 ? 'Edificio' : num === 2 ? 'Plan' : 'Administrador'}
                            </span>
                        </div>
                    ))}
                    {/* Connecting Line */}
                    <div className="absolute left-[10%] right-[10%] top-12 md:top-16 h-1 -mt-0.5 bg-slate-100 dark:bg-slate-700 z-0">
                        <div
                            className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
                            style={{ width: `${((step - 1) / 2) * 100}%` }}
                        />
                    </div>
                </div>

                <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); nextStep(); }}>

                    {/* STEP 1: Community Data */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Building className="text-blue-500" /> Datos de la Comunidad
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                ¿Cómo se llama el edificio o condominio que vas a administrar?
                            </p>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Nombre del Proyecto</label>
                                <Input
                                    placeholder="Ej: Condominio Alto Las Condes"
                                    value={communityName}
                                    onChange={(e) => setCommunityName(e.target.value)}
                                    required
                                    className="text-lg py-6"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Dirección Principal</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <Input
                                        placeholder="Ej: Av. Las Condes 1234, Santiago"
                                        value={communityAddress}
                                        onChange={(e) => setCommunityAddress(e.target.value)}
                                        required
                                        className="pl-10 text-lg py-6"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button type="submit" size="lg" className="bg-blue-600 hover:bg-blue-700 gap-2">
                                    Siguiente <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Pricing Tiers */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Building2 className="text-blue-500" /> Elige tu Plan
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                                Todos los planes tienen 14 días gratis. No se requiere tarjeta de crédito para empezar.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {tiers.map((tier) => (
                                    <div
                                        key={tier.id}
                                        onClick={() => setSelectedTierId(tier.id)}
                                        className={`cursor-pointer rounded-xl border-2 p-5 transition-all ${selectedTierId === tier.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-lg text-slate-800 dark:text-white">{tier.name}</h3>
                                            {selectedTierId === tier.id && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
                                        </div>
                                        <div className="mb-4">
                                            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">${tier.price_per_unit}</span>
                                            <span className="text-xs text-slate-500"> / unidad</span>
                                        </div>

                                        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                                            <li className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Gastos Comunes
                                            </li>
                                            <li className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Conserjería
                                            </li>
                                            {tier.features.amenities && (
                                                <li className="flex items-center gap-2 font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Reservas Amenidades
                                                </li>
                                            )}
                                            {tier.features.coco_ai && (
                                                <li className="flex items-center gap-2 font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Agente IA (CoCo)
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 flex justify-between">
                                <Button type="button" variant="outline" onClick={prevStep} className="gap-2">
                                    <ChevronLeft className="w-4 h-4" /> Volver
                                </Button>
                                <Button
                                    type="button"
                                    onClick={(e) => {
                                        if (!selectedTierId) {
                                            toast({ title: "Atención", description: "Debes seleccionar un plan para continuar", variant: "destructive" });
                                            return;
                                        }
                                        nextStep();
                                    }}
                                    size="lg"
                                    className="bg-blue-600 hover:bg-blue-700 gap-2"
                                >
                                    Siguiente <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Admin User */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Cuenta de Administrador</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Crea el usuario principal de {communityName || "la comunidad"}.
                            </p>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Tu Nombre Completo</label>
                                <Input
                                    placeholder="Ej: Juan Pérez"
                                    value={adminName}
                                    onChange={(e) => setAdminName(e.target.value)}
                                    required
                                    className="py-5"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Correo Electrónico Laboral</label>
                                <Input
                                    type="email"
                                    placeholder="admin@mi-condominio.com"
                                    value={adminEmail}
                                    onChange={(e) => setAdminEmail(e.target.value)}
                                    required
                                    className="py-5"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Contraseña</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    value={adminPassword}
                                    onChange={(e) => setAdminPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="py-5"
                                />
                            </div>

                            <div className="pt-4 flex justify-between items-center">
                                <Button type="button" variant="outline" onClick={prevStep} className="gap-2">
                                    <ChevronLeft className="w-4 h-4" /> Volver
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={loading || !selectedTierId}
                                    size="lg"
                                    className="bg-green-600 hover:bg-green-700 gap-2 px-8"
                                >
                                    {loading ? "Creando..." : "Crear Comunidad"} {!loading && <CheckCircle2 className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    )}
                </form>
            </div>

            {/* Back logic */}
            <div className="mt-8 text-center text-sm text-slate-500">
                ¿Ya tienes una comunidad registrada? <Link href="/login" className="text-blue-600 font-semibold hover:underline">Inicia sesión aquí</Link>
            </div>
        </div>
    );
}
