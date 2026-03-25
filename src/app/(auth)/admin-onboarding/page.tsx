"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase";
import { Building, Mail, Lock, User, Eye, EyeOff } from "lucide-react";

export default function AdminOnboardingPage() {
    const [communityName, setCommunityName] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
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
            // 1. Sign up the user (initially gets default community via trigger)
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: fullName,
                        role: 'admin',
                    }
                }
            });

            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error("No se pudo crear el usuario");

            // 2. We must wait for session to be established to insert community.
            // When using signUp with email confirmation disabled, it returns a session.
            // If email confirmation is enabled, we can't create the community right now.
            // Let's assume auto-confirm locally or we just insert it. Wait, if auto-confirm is off, session is null.
            if (!authData.session) {
                toast({
                    title: "¡Cuenta creada!",
                    description: "Por favor revisa tu correo para confirmar tu cuenta. Una vez confirmada, podrás configurar tu condominio al iniciar sesión.",
                    variant: "success",
                });
                router.push("/login");
                return;
            }

            // 3. User is authenticated, create Community
            const { data: communityData, error: commError } = await supabase
                .from('communities')
                .insert({
                    name: communityName.trim(),
                    subscription_status: 'trialing'
                })
                .select('id')
                .single();

            if (commError) throw commError;

            // 4. Update Profile to link to the new community
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ 
                    community_id: communityData.id,
                    role: 'admin' 
                })
                .eq('id', authData.user.id);

            if (profileError) throw profileError;

            toast({
                title: "¡Comunidad creada con éxito!",
                description: `Bienvenido a la administración de ${communityName}`,
                variant: "success",
            });
            router.push("/home");
            
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
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white text-2xl font-bold mb-4 shadow-lg">
                        CC
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                        Registra tu Condominio
                    </h1>
                    <p className="text-slate-600 dark:text-slate-300">
                        Crea tu cuenta de administrador
                    </p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Community Name Field */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Nombre del Condominio
                            </label>
                            <div className="relative">
                                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-500" />
                                <Input
                                    type="text"
                                    value={communityName}
                                    onChange={(e) => setCommunityName(e.target.value)}
                                    placeholder="Ej: Edificio Los Pinos"
                                    required
                                    className="pl-10 border-indigo-200 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        
                        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Datos del Administrador
                            </label>
                            <div className="space-y-4">
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
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700"
                        >
                            {loading ? "Creando condominio..." : "Registrar Condominio"}
                        </Button>
                    </form>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white dark:bg-slate-800 text-slate-500">
                                ¿Eres Residente?
                            </span>
                        </div>
                    </div>

                    <Link
                        href="/signup"
                        className="block w-full text-center py-2 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Registro de Residentes
                    </Link>
                </div>
            </div>
        </div>
    );
}
