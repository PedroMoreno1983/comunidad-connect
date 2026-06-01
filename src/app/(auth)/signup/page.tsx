"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Home, ShieldCheck, Users } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";

const ROLES = [
    { id: "resident", label: "Residente", description: "Unidad y gastos personales", icon: Home },
    { id: "concierge", label: "Conserje", description: "Turno, visitas y paquetes", icon: ShieldCheck },
    { id: "admin", label: "Admin", description: "Gestión completa", icon: Building2 },
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
            toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
            return;
        }

        if (password.length < 6) {
            toast({ title: "Error", description: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
            return;
        }

        if (!accessCode.trim()) {
            toast({ title: "Error", description: "Debes ingresar un código de invitación", variant: "destructive" });
            return;
        }

        setLoading(true);
        const cleanCode = accessCode.trim().toUpperCase();

        const { data: communities, error: codeError } = await supabase
            .from("communities")
            .select("id, resident_code, concierge_code, admin_code")
            .or(`resident_code.eq.${cleanCode},concierge_code.eq.${cleanCode},admin_code.eq.${cleanCode}`);

        if (codeError || !communities || communities.length === 0) {
            toast({ title: "Código inválido", description: "El código de invitación no existe o es incorrecto.", variant: "destructive" });
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
            toast({ title: "Rol no coincide", description: `El código ingresado no corresponde al perfil ${roleLabel}.`, variant: "destructive" });
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
            description: `Enviamos un correo a ${email}. Confírmalo para iniciar sesión.`,
            variant: "success",
        });
        router.push("/login");
    };

    return (
        <main className="min-h-screen flex" style={{ background: "var(--cc-ivory)" }}>
            <div className="grid w-full lg:grid-cols-[440px_1fr]">
                {/* Left side: Signup Form */}
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
                            {/* Role selectors inside segmented grid */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">PERFIL DE ACCESO</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {ROLES.map(({ id, label }) => {
                                        const active = selectedRole === id;
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setSelectedRole(id)}
                                                className="py-2.5 text-center text-xs font-semibold rounded-xl border transition-all"
                                                style={{
                                                    background: active ? "var(--cc-ink)" : "var(--cc-paper)",
                                                    color: active ? "var(--cc-paper)" : "var(--cc-ink-muted)",
                                                    borderColor: active ? "transparent" : "var(--cc-line-strong)",
                                                    boxShadow: active ? "var(--cc-shadow-sm)" : "none"
                                                }}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">NOMBRE COMPLETO</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan Pérez"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">CORREO ELECTRÓNICO</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@correo.com"
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
                                    placeholder="Mínimo 6 caracteres"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">CONFIRMAR CONTRASEÑA</label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite tu contraseña"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">CÓDIGO DE INVITACIÓN</label>
                                <input
                                    type="text"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                                    placeholder="INV-X93F"
                                    required
                                    className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all font-mono uppercase tracking-[0.16em]"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                />
                            </div>

                            {selectedRole === "resident" && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase block">DEPARTAMENTO / UNIDAD</label>
                                    <input
                                        type="text"
                                        value={departmentNumber}
                                        onChange={(e) => setDepartmentNumber(e.target.value)}
                                        placeholder="Ej: 501, 3B, 1201"
                                        required
                                        className="w-full px-4 py-3 rounded-xl border bg-[#FAF7F1] text-sm focus:outline-none focus:ring-2 focus:ring-[#B5664E] transition-all"
                                        style={{ borderColor: "var(--cc-line-strong)" }}
                                    />
                                </div>
                            )}

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

                {/* Right side: Onboarding Hero (hidden on mobile) */}
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
                      className="absolute top-1/4 left-0 w-[400px] h-[400px] rounded-full blur-3xl pointer-events-none"
                      style={{ background: "radial-gradient(circle, rgba(181,102,78,0.2) 0%, transparent 70%)" }}
                    />

                    <div className="relative z-10 flex justify-end">
                        <Link href="/" className="inline-flex items-center gap-2">
                            <Brand size={20} tone="inverse" withMark />
                        </Link>
                    </div>

                    <div className="relative z-10 max-w-md my-auto space-y-8 ml-auto text-right">
                        <div className="space-y-4">
                            <span className="text-[10px] font-semibold tracking-widest text-[#D9A691] uppercase">ACCESO CONTROLADO</span>
                            <DisplayHeading size={44} style={{ color: "var(--cc-paper)" }}>
                                Cada usuario entra con<br />
                                el <em style={{ color: "var(--cc-copper-soft)", fontStyle: "italic" }}>rol correcto.</em>
                            </DisplayHeading>
                            <p className="text-sm leading-relaxed" style={{ color: "var(--cc-ink-faint)" }}>
                                Los códigos separan los accesos de residentes, conserjería y administración para garantizar que tus datos y acciones se mantengan seguros.
                            </p>
                        </div>

                        {/* Floating Card Preview */}
                        <div 
                          className="rounded-2xl border p-5 shadow-xl bg-[#1A1611]/90 backdrop-blur-md relative transform rotate-[1deg] translate-y-2 text-left"
                          style={{ borderColor: "rgba(250, 247, 241, 0.1)" }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-[rgba(250,247,241,0.08)]">
                                    <Users className="h-5 w-5 text-white" />
                                </div>
                                <div className="text-xs font-semibold">Seguridad y Privacidad garantizadas</div>
                            </div>
                        </div>

                        {/* Pagination Dots */}
                        <div className="flex gap-1.5 justify-end pt-4">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(250,247,241,0.2)" }} />
                            <span className="w-6 h-1.5 rounded-full" style={{ background: "var(--cc-copper)" }} />
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(250,247,241,0.2)" }} />
                        </div>
                    </div>

                    <div className="relative z-10 text-xs text-right" style={{ color: "var(--cc-ink-tertiary)" }}>
                        © 2026 Convive Connect. Todos los derechos reservados.
                    </div>
                </section>
            </div>
        </main>
    );
}
