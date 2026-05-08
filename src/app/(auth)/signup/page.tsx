"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Home, Key, Lock, Mail, ShieldCheck, User, Users } from "lucide-react";

const ROLES = [
    { id: "resident", label: "Residente", description: "Unidad y gastos personales", icon: Home },
    { id: "concierge", label: "Conserje", description: "Turno, visitas y paquetes", icon: ShieldCheck },
    { id: "admin", label: "Admin", description: "Gestion completa", icon: Building2 },
] as const;

export default function SignUpPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [accessCode, setAccessCode] = useState("");
    const [departmentNumber, setDepartmentNumber] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [selectedRole, setSelectedRole] = useState<"resident" | "concierge" | "admin">("resident");

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

        if (!accessCode.trim()) {
            toast({ title: "Error", description: "Debes ingresar un codigo de invitacion", variant: "destructive" });
            return;
        }

        setLoading(true);
        const cleanCode = accessCode.trim().toUpperCase();

        const { data: communities, error: codeError } = await supabase
            .from("communities")
            .select("id, resident_code, concierge_code, admin_code")
            .or(`resident_code.eq.${cleanCode},concierge_code.eq.${cleanCode},admin_code.eq.${cleanCode}`);

        if (codeError || !communities || communities.length === 0) {
            toast({ title: "Codigo invalido", description: "El codigo de invitacion no existe o es incorrecto.", variant: "destructive" });
            setLoading(false);
            return;
        }

        const community = communities[0];
        const isCodeValidForRole =
            (selectedRole === "resident" && community.resident_code === cleanCode) ||
            (selectedRole === "concierge" && community.concierge_code === cleanCode) ||
            (selectedRole === "admin" && community.admin_code === cleanCode);

        if (!isCodeValidForRole) {
            const roleLabel = selectedRole === "resident" ? "Residente" : selectedRole === "admin" ? "Administrador" : "Conserje";
            toast({ title: "Rol no coincide", description: `El codigo ingresado no corresponde al perfil ${roleLabel}.`, variant: "destructive" });
            setLoading(false);
            return;
        }

        const { error } = await signUp(email, password, {
            name: fullName,
            community_id: community.id,
            role: selectedRole,
            ...(selectedRole === "resident" && departmentNumber ? { department_number: departmentNumber.trim() } : {}),
        });

        if (error) {
            toast({ title: "Error al crear cuenta", description: error.message || "Intenta con otro email", variant: "destructive" });
            setLoading(false);
            return;
        }

        toast({
            title: "Cuenta creada",
            description: `Enviamos un correo a ${email}. Confirmalo para iniciar sesion.`,
            variant: "success",
        });
        router.push("/login");
    };

    return (
        <main className="min-h-screen bg-canvas px-4 py-8">
            <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[420px_1fr]">
                <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm sm:p-8">
                    <div className="mb-8 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Invitacion</p>
                            <h1 className="mt-2 text-3xl font-semibold cc-text-primary">Crear cuenta</h1>
                            <p className="mt-2 text-sm cc-text-secondary">Ingresa con el codigo entregado por tu comunidad.</p>
                        </div>
                        <Link href="/" className="rounded-lg border border-subtle p-2.5 cc-text-secondary transition-colors hover:bg-elevated" aria-label="Volver al inicio">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold cc-text-primary">Perfil</label>
                            <div className="grid gap-2">
                                {ROLES.map(({ id, label, description, icon: Icon }) => {
                                    const active = selectedRole === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setSelectedRole(id)}
                                            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${active ? "border-brand-500 bg-brand-50" : "border-subtle bg-canvas hover:border-brand-300"}`}
                                        >
                                            <Icon className={`h-4 w-4 ${active ? "text-brand-600" : "cc-text-tertiary"}`} />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold cc-text-primary">{label}</span>
                                                <span className="block text-xs cc-text-secondary">{description}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <Field id="fullName" label="Nombre completo" icon={<User className="h-5 w-5" />}>
                            <Input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Perez" required className="pl-10" />
                        </Field>

                        <Field id="email" label="Email" icon={<Mail className="h-5 w-5" />}>
                            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required className="pl-10" />
                        </Field>

                        <Field id="password" label="Contrasena" icon={<Lock className="h-5 w-5" />}>
                            <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo 6 caracteres" required className="pl-10 pr-10" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}>
                                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                        </Field>

                        <Field id="confirmPassword" label="Confirmar contrasena" icon={<Lock className="h-5 w-5" />}>
                            <Input id="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite tu contrasena" required className="pl-10" />
                        </Field>

                        <Field id="accessCode" label="Codigo de invitacion" icon={<Key className="h-5 w-5" />}>
                            <Input id="accessCode" type="text" value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase())} placeholder="RSD-A3F9K2" required className="pl-10 font-mono uppercase tracking-[0.16em]" />
                        </Field>

                        {selectedRole === "resident" && (
                            <Field id="departmentNumber" label="Unidad o departamento" icon={<Home className="h-5 w-5" />}>
                                <Input id="departmentNumber" type="text" value={departmentNumber} onChange={(e) => setDepartmentNumber(e.target.value)} placeholder="501, 3B, 1201" required className="pl-10" />
                            </Field>
                        )}

                        <Button type="submit" disabled={loading} className="w-full" trailingIcon={<ArrowRight className="h-4 w-4" />}>
                            {loading ? "Creando cuenta..." : "Crear cuenta"}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link href="/login" className="text-sm font-semibold cc-text-secondary transition-colors hover:text-brand-600">
                            Ya tengo cuenta
                        </Link>
                    </div>
                </section>

                <section className="hidden space-y-6 lg:block">
                    <Link href="/" className="inline-flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white">
                            <Building2 className="h-5 w-5" />
                        </span>
                        <span className="text-xl font-semibold cc-text-primary">Comunidad<span className="text-brand-500">Connect</span></span>
                    </Link>
                    <div className="max-w-xl space-y-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Acceso controlado</p>
                        <h2 className="text-5xl font-semibold leading-tight cc-text-primary">Cada usuario entra con el rol correcto.</h2>
                        <p className="text-lg leading-8 cc-text-secondary">
                            Los codigos separan permisos de residentes, conserjeria y administracion para mantener datos y acciones bajo control.
                        </p>
                    </div>
                    <div className="grid max-w-2xl grid-cols-3 gap-3">
                        {["Codigo validado", "Unidad vinculada", "Permisos por rol"].map((item) => (
                            <div key={item} className="rounded-lg border border-subtle bg-surface p-4">
                                <Users className="mb-3 h-5 w-5 text-brand-500" />
                                <p className="text-sm font-semibold cc-text-primary">{item}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}

function Field({ id, label, icon, children }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <label htmlFor={id} className="mb-2 block text-sm font-semibold cc-text-primary">{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
                {children}
            </div>
        </div>
    );
}
