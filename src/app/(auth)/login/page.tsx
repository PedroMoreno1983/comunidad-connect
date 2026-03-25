"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signIn, signUp } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await signIn(email, password);

        if (error) {
            toast({
                title: "Error al iniciar sesión",
                description: error.message || "Verifica tus credenciales",
                variant: "destructive",
            });
            setLoading(false);
        } else {
            toast({
                title: "¡Bienvenido!",
                description: "Has iniciado sesión correctamente",
                variant: "success",
            });
            router.push("/");
        }
    };

    const handleDemoLogin = async (demoEmail: string, demoPass: string, role: string) => {
        setLoading(true);
        // Intentar Iniciar Sesión primero
        const { error } = await signIn(demoEmail, demoPass);
        
        if (error) {
            // Si el usuario no existe (credenciales inválidas), lo creamos automáticamente
            if (error.message.includes('Invalid') || error.message.includes('No user') || error.message.includes('credenciales')) {
                
                const { error: signUpError } = await signUp(demoEmail, demoPass, {
                    name: role === 'admin' ? 'Admin Demo' : 'Residente Demo',
                    role: role,
                    community_id: '00000000-0000-0000-0000-000000000000' // The default demo community
                });

                if (signUpError) {
                    toast({ title: "Error", description: "No pudimos crear el usuario demo. " + signUpError.message, variant: "destructive" });
                    setLoading(false);
                    return;
                }

                // If created successfully, try to sign in again immediately
                await signIn(demoEmail, demoPass);
                toast({ title: "Cuenta Demo Creada", description: "Entrando...", variant: "success" });
                router.push("/");
                return;
            } else {
                toast({ title: "Error", description: error.message, variant: "destructive" });
                setLoading(false);
                return;
            }
        }

        toast({ title: "¡Entrando a la Demo!", description: "Has iniciado sesión", variant: "success" });
        router.push("/");
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
                        Iniciar Sesión
                    </h1>
                    <p className="text-slate-600 dark:text-slate-300">
                        Accede a tu cuenta de ComunidadConnect
                    </p>
                </div>

                {/* Login Form */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
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
                                    placeholder="••••••••"
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

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                        >
                            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
                        </Button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                ¿No tienes cuenta?
                            </span>
                        </div>
                    </div>

                    {/* Sign Up Link */}
                    <Link
                        href="/signup"
                        className="block w-full text-center py-3 px-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        Crear Cuenta
                    </Link>
                </div>

                {/* Demo Access */}
                <div className="mt-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800/50 text-center">
                    <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-4">
                        ¿Quieres probar la plataforma?
                    </h3>
                    <div className="flex flex-col gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDemoLogin("admin@demo.com", "demo123", "admin")}
                            disabled={loading}
                            className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-800/50 flex justify-center items-center gap-2"
                        >
                            🏢 Ver Demo Administrador
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDemoLogin("conserje@demo.com", "demo123", "concierge")}
                            disabled={loading}
                            className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-800/50 flex justify-center items-center gap-2"
                        >
                            🔐 Ver Demo Conserje
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDemoLogin("residente@demo.com", "demo123", "resident")}
                            disabled={loading}
                            className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-800/50 flex justify-center items-center gap-2"
                        >
                            🏠 Ver Demo Residente
                        </Button>
                    </div>
                    <p className="text-xs text-indigo-500 mt-4">
                        Acceso completo a todos los módulos — sin datos reales
                    </p>
                </div>

                {/* Admin Registration CTA */}
                <div className="mt-4 text-center">
                    <Link
                        href="/admin-onboarding"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                    >
                        🏢 ¿Eres administrador? Registra tu edificio aquí →
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
