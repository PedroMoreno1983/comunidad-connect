"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BrandWordmark } from "@/components/BrandWordmark";
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Crown, Eye, EyeOff, Loader2, Lock, Mail, MapPin, Star, User, Zap } from "lucide-react";

const PLANS = [
    {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Básico",
        price: "$19.990",
        unit: "+ $490 / unidad/mes",
        icon: Star,
        features: ["Muro y avisos", "Directorio vecinal", "Conserjería digital", "Espacios comunes", "Control de visitas"],
    },
    {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Avanzado",
        price: "$34.990",
        unit: "+ $690 / unidad/mes",
        icon: Zap,
        badge: "Recomendado",
        features: ["Todo lo del Básico", "Mantenimiento", "Votaciones online", "Pagos online", "Reportes financieros"],
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

const STEP_LABELS = ["Plan", "Edificio", "Activador"];

type GeocodeSuggestion = {
    label: string;
    latitude: number;
    longitude: number;
    placeId: string;
    source: string;
};

type RegisterResponse = {
    error?: string;
    code?: string;
    loginUrl?: string;
};

export default function AdminOnboardingPage() {
    const [step, setStep] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(PLANS[1].id);
    const [communityName, setCommunityName] = useState("");
    const [address, setAddress] = useState("");
    const [addressSuggestions, setAddressSuggestions] = useState<GeocodeSuggestion[]>([]);
    const [selectedAddress, setSelectedAddress] = useState<GeocodeSuggestion | null>(null);
    const [geocoding, setGeocoding] = useState(false);
    const [units, setUnits] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        const query = address.trim();
        if (query.length < 5 || selectedAddress?.label === query) {
            setAddressSuggestions([]);
            setGeocoding(false);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setGeocoding(true);
            try {
                const response = await fetch(`/api/geocode/address?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                    cache: "no-store",
                });
                const data = await response.json().catch(() => ({})) as { suggestions?: GeocodeSuggestion[] };
                setAddressSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.warn("[AdminOnboarding] geocode failed:", error);
                    setAddressSuggestions([]);
                }
            } finally {
                if (!controller.signal.aborted) setGeocoding(false);
            }
        }, 450);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [address, selectedAddress]);

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
        if (!communityName.trim()) {
            toast({ title: "Error", description: "Debes ingresar el nombre del condominio", variant: "destructive" });
            return;
        }
        if (!acceptTerms || !acceptPrivacy) {
            toast({ title: "Falta tu confirmación", description: "Acepta los términos y confirma que leíste la política de privacidad.", variant: "destructive" });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/admin-onboarding/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: selectedPlan,
                    communityName,
                    address,
                    selectedAddress,
                    units,
                    fullName,
                    email,
                    password,
                    acceptTerms,
                    acceptPrivacy,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as RegisterResponse;
                if (response.status === 409 && data.code === "EMAIL_ALREADY_REGISTERED") {
                    toast({
                        title: "Cuenta existente",
                        description: data.error || "Este correo ya tiene cuenta. Inicia sesión para continuar.",
                        variant: "default",
                    });
                    router.push(data.loginUrl || `/login?next=%2Fadmin%2Fonboarding&email=${encodeURIComponent(email)}`);
                    return;
                }
                throw new Error(data.error || "No se pudo registrar el edificio.");
            }

            toast({
                title: "Comunidad creada",
                description: `Revisa ${email} para confirmar tu correo antes de administrar ${communityName}.`,
                variant: "success",
            });
            router.push("/login?check_email=1&next=%2Fadmin%2Fonboarding");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Ocurrió un error inesperado";
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
                        <BrandWordmark className="text-xl text-brand-600" />
                    </Link>
                    <div className="space-y-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Activacion Inteligente</p>
                        <h1 className="text-5xl font-semibold leading-tight cc-text-primary">Crea el edificio y deja a CoCo listo para cargarlo.</h1>
                        <p className="text-lg leading-8 cc-text-secondary">
                            Primero creamos la comunidad y el administrador. Luego CoCo interpreta archivos, detecta brechas y prepara la sincronizacion con aprobacion.
                        </p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-surface p-5">
                        <p className="text-sm font-semibold cc-text-primary">Activacion premium desde el primer dia</p>
                        <p className="mt-2 text-sm leading-6 cc-text-secondary">Sube nominas, gastos o reglamentos despues de crear la cuenta. CoCo los convierte en datos revisables antes de tocar produccion.</p>
                    </div>
                </aside>

                <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm sm:p-8">
                    <div className="mb-8 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Registro</p>
                            <h2 className="mt-2 text-3xl font-semibold cc-text-primary">Activa tu edificio</h2>
                        <p className="mt-2 text-sm cc-text-secondary">Elige plan, georreferencia la dirección y crea la cuenta que aprobará la carga inteligente.</p>
                        </div>
                        <Link href="/login" className="rounded-lg border border-subtle p-2.5 cc-text-secondary transition-colors hover:bg-elevated" aria-label="Volver al login">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </div>

                    <div className="mb-8 grid grid-cols-3 gap-2">
                        {STEP_LABELS.map((label, index) => (
                            <div key={label} className={`rounded-lg border px-3 py-2 ${index === step ? "border-brand-500 bg-brand-50" : index < step ? "border-emerald-200 bg-emerald-50" : "border-subtle bg-canvas"}`}>
                                <div className="flex items-center gap-2">
                                    {index < step && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
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
                                    Decidir después
                                </Button>
                                <Button type="button" disabled={!selectedPlan} onClick={() => setStep(1)} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                                    Continuar
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-5">
                            <Field label="Nombre del edificio o condominio" required>
                                <Input type="text" value={communityName} onChange={(e) => setCommunityName(e.target.value)} placeholder="Edificio Los Pinos" required />
                            </Field>
                            <Field label="Dirección">
                                <div className="relative">
                                    <Input
                                        type="text"
                                        value={address}
                                        onChange={(e) => {
                                            setAddress(e.target.value);
                                            setSelectedAddress(null);
                                        }}
                                        placeholder="Av. Providencia 1234, Santiago"
                                        className="pr-10"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                        {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                                    </span>
                                    {addressSuggestions.length > 0 && (
                                        <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-subtle bg-surface p-1 shadow-lg">
                                            {addressSuggestions.map((suggestion) => (
                                                <button
                                                    key={`${suggestion.source}-${suggestion.placeId}`}
                                                    type="button"
                                                    onClick={() => {
                                                        setAddress(suggestion.label);
                                                        setSelectedAddress(suggestion);
                                                        setAddressSuggestions([]);
                                                    }}
                                                    className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-elevated"
                                                >
                                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                                                    <span className="leading-5 cc-text-primary">{suggestion.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {selectedAddress ? (
                                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Dirección georreferenciada
                                    </p>
                                ) : address.trim().length >= 5 ? (
                                    <p className="mt-2 text-xs cc-text-secondary">
                                        Selecciona una sugerencia para guardar coordenadas del edificio.
                                    </p>
                                ) : null}
                            </Field>
                            <Field label="Número de unidades">
                                <Input type="number" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="80" min="1" />
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
                                <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña, mínimo 8 caracteres" minLength={8} required className="pl-10 pr-10" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </IconField>
                            <IconField icon={<Lock className="h-5 w-5" />}>
                                <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirma tu contraseña" required className="pl-10" />
                            </IconField>

                            <div className="rounded-lg border border-subtle bg-canvas p-4 text-sm">
                                <p className="font-semibold cc-text-primary">{communityName || "Condominio por definir"}</p>
                                {address && <p className="mt-1 cc-text-secondary">{address}</p>}
                                <p className="mt-1 cc-text-secondary">Plan: {PLANS.find(p => p.id === selectedPlan)?.name || "Por definir"}</p>
                            </div>

                            <div className="space-y-3 rounded-lg border border-subtle bg-canvas p-4 text-sm">
                                <label className="flex items-start gap-3">
                                    <input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} required className="mt-1" />
                                    <span>Acepto los <Link href="/terms" target="_blank" className="font-semibold underline">términos del servicio</Link>.</span>
                                </label>
                                <label className="flex items-start gap-3">
                                    <input type="checkbox" checked={acceptPrivacy} onChange={event => setAcceptPrivacy(event.target.checked)} required className="mt-1" />
                                    <span>Confirmo que leí la <Link href="/privacy" target="_blank" className="font-semibold underline">política de privacidad</Link>.</span>
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button type="button" variant="outline" onClick={() => setStep(1)}>Volver</Button>
                                <Button type="submit" disabled={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                                    {loading ? "Creando..." : "Crear y continuar a carga IA"}
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
