"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase";
import { Mail, Lock, User, Eye, EyeOff, Key, Home } from "lucide-react";

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
    const [selectedRole, setSelectedRole] = useState<'resident' | 'concierge' | 'admin'>('resident');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (password !== confirmPassword) {
            toast({
                title: "Error",
                description: "Las contraseñas no coinciden",
                variant: "destructive",
            });
            return;
        }

        if (password.length < 6) {
            toast({
                title: "Error",
                description: "La contraseña debe tener al menos 6 caracteres",
                variant: "destructive",
            });
            return;
        }

        if (!accessCode || accessCode.trim().length === 0) {
            toast({
                title: "Error",
                description: "Debes ingresar un código de invitación",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        // Verify Access Code
        const cleanCode = accessCode.trim().toUpperCase();
        
        // Admins can use a master code or we check communities
        // For simplicity in this logical flow, we verify if the code matches the selected role's community code
        const { data: communities, error: codeError } = await supabase
            .from('communities')
            .select('id, resident_code, concierge_code, admin_code')
            .or(`resident_code.eq.${cleanCode},concierge_code.eq.${cleanCode},admin_code.eq.${cleanCode}`);

        if (codeError || !communities || communities.length === 0) {
            toast({
                title: "Código Inválido",
                description: "El código de invitación no existe o es incorrecto.",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        const community = communities[0];
        
        // Validate if the code matches the selected role
        let isCodeValidForRole = false;
        if (selectedRole === 'resident' && community.resident_code === cleanCode) isCodeValidForRole = true;
        if (selectedRole === 'concierge' && community.concierge_code === cleanCode) isCodeValidForRole = true;
        if (selectedRole === 'admin' && community.admin_code === cleanCode) isCodeValidForRole = true;

        if (!isCodeValidForRole) {
            toast({
                title: "Rol no coincide",
                description: `El código ingresado no es válido para el perfil de ${selectedRole === 'resident' ? 'Residente' : selectedRole === 'admin' ? 'Administrador' : 'Conserje'}.`,
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        const { error } = await signUp(email, password, {
            full_name: fullName,
            community_id: community.id,
            role: selectedRole,
            ...(selectedRole === 'resident' && departmentNumber ? { department_number: departmentNumber.trim() } : {})
        });

        if (error) {
            toast({
                title: "Error al crear cuenta",
                description: error.message || "Intenta con otro email",
                variant: "destructive",
            });
            setLoading(false);
        } else {
            toast({
                title: "¡Cuenta creada con éxito!",
                description: `Hemos enviado un correo a ${email}. Debes confirmarlo para poder iniciar sesión.`,
                variant: "success",
            });
            router.push("/login");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white text-2xl font-bold mb-4 shadow-lg">
                        CC
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                        Crear Cuenta
                    </h1>
                    <p className="text-slate-600 dark:text-slate-300">
                        Únete a ComunidadConnect
                    </p>
                </div>

                {/* Sign Up Form */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Profile Type Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Tipo de Perfil
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['resident', 'admin', 'concierge'] as const).map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setSelectedRole(role)}
                                        className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                                            selectedRole === role
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20'
                                            : 'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-900 dark:border-slate-800'
                                        }`}
                                    >
                                        {role === 'resident' ? 'Residente' : role === 'admin' ? 'Admin' : 'Conserje'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Full Name Field */}
                        <div>
                            <label htmlFor="fullName" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Nombre Completo
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    id="fullName"
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan Pérez"
                                    required
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Email Field */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@email.com"
                                    required
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    required
                                    className="pl-10 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password Field */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Confirmar Contraseña
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    id="confirmPassword"
                                    type={showPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite tu contraseña"
                                    required
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        {/* Access Code Field */}
                        <div>
                            <label htmlFor="accessCode" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Código de Invitación
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input
                                    id="accessCode"
                                    type="text"
                                    value={accessCode}
                                    onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                                    placeholder="Ej: RSD-A3F9K2"
                                    required
                                    className="pl-10 tracking-widest font-mono uppercase"
                                />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {selectedRole === 'admin' 
                                    ? "Ingresa el código maestro de administrador."
                                    : "Ingresa el código que te proporcionó el administrador de tu comunidad."}
                            </p>
                        </div>

                        {/* Department Number - only for residents */}
                        {selectedRole === 'resident' && (
                            <div>
                                <label htmlFor="departmentNumber" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Número de Departamento
                                </label>
                                <div className="relative">
                                    <Home className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                    <Input
                                        id="departmentNumber"
                                        type="text"
                                        value={departmentNumber}
                                        onChange={(e) => setDepartmentNumber(e.target.value)}
                                        placeholder="Ej: 501, 3B, 1201"
                                        required={selectedRole === 'resident'}
                                        className="pl-10"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Número o identificador de tu departamento.
                                </p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                        >
                            {loading ? "Creando cuenta..." : "Crear Cuenta"}
                        </Button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                ¿Ya tienes cuenta?
                            </span>
                        </div>
                    </div>

                    {/* Login Link */}
                    <Link
                        href="/login"
                        className="block w-full text-center py-3 px-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        Iniciar Sesión
                    </Link>
                </div>

                {/* Back to Home */}
                <div className="text-center mt-6">
                    <Link
                        href="/"
                        className="text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        ← Volver al inicio
                    </Link>
                </div>
            </div>
        </div>
    );
}
