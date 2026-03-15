"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { Hammer, Briefcase, Phone, Mail, User, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ProviderRegisterPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        category: "general",
        phone: "",
        email: "",
        description: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { error } = await supabase
                .from('service_providers')
                .insert([{
                    name: formData.name,
                    category: formData.category,
                    contact_phone: formData.phone,
                    // Note: 'email' and 'description' columns might not exist yet, 
                    // we strictly follow current schema for service_providers
                }]);

            if (error) throw error;

            setSubmitted(true);
            toast({
                title: "Registro exitoso",
                description: "Tu perfil ha sido enviado para revisión.",
                variant: "success"
            });
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "No se pudo completar el registro.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center space-y-6 animate-in zoom-in duration-500">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-900">¡Postulación Enviada!</h1>
                    <p className="text-slate-600">Nuestro equipo revisará tus antecedentes y te contactaremos por teléfono para validar tu perfil.</p>
                    <Button onClick={() => router.push("/")} className="w-full h-12 rounded-2xl bg-indigo-600">
                        Volver al inicio
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <Link href="/" className="mb-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-medium">
                <ArrowLeft className="h-4 w-4" />
                Volver
            </Link>

            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
                <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl">
                            <Hammer className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black">Regístrate como Técnico</h1>
                            <p className="opacity-90">Únete a nuestra red de servicios para edificios.</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Nombre Completo</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input 
                                    required 
                                    className="pl-10" 
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="Ej: Pedro González" 
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Especialidad</label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <select 
                                    className="w-full pl-10 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 appearance-none"
                                    value={formData.category}
                                    onChange={e => setFormData({...formData, category: e.target.value})}
                                >
                                    <option value="plumbing">Gásfiter / Plomería</option>
                                    <option value="electrical">Electricista</option>
                                    <option value="locksmith">Cerrajería</option>
                                    <option value="cleaning">Limpieza</option>
                                    <option value="general">Mantenimiento General</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Teléfono (WhatsApp)</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input 
                                    required 
                                    className="pl-10" 
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                    placeholder="+56 9 1234 5678" 
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <Input 
                                    required 
                                    className="pl-10" 
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                    placeholder="ejemplo@correo.com" 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Breve descripción de tus servicios</label>
                        <textarea 
                            className="w-full min-h-[120px] rounded-2xl border border-slate-200 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="Cuéntanos sobre tu experiencia..."
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        />
                    </div>

                    <Button 
                        type="submit" 
                        disabled={loading}
                        className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-lg shadow-indigo-200"
                    >
                        {loading ? <Loader2 className="animate-spin h-6 w-6" /> : "Enviar Postulación"}
                    </Button>

                    <p className="text-xs text-center text-slate-400">
                        Al registrarte, aceptas nuestras políticas de seguridad y validación de perfiles técnicos externos.
                    </p>
                </form>
            </div>
        </div>
    );
}
