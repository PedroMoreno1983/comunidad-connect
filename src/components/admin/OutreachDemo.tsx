"use client";

import { useState } from "react";
import { Mail, User, Building, Send, ChevronRight, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDemoRestrictions } from "@/hooks/useDemoRestrictions";

export default function OutreachDemo() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        adminName: "",
        adminEmail: "",
        condoName: ""
    });
    const { isDemoUser } = useDemoRestrictions();

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.adminName || !formData.adminEmail) {
            toast({ title: "Faltan datos", description: "Por favor completa el nombre y el correo", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/email/outreach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al enviar el correo");

            toast({ title: "¡Correo enviado!", description: `Se ha enviado la propuesta a ${formData.adminName}`, variant: "success" });
            setFormData({ adminName: "", adminEmail: "", condoName: "" }); // Reset form
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo enviar el correo";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1 space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-100 dark:bg-brand-900/30 text-role-admin-fg rounded-full text-xs font-bold uppercase tracking-wider">
                        <Sparkles className="h-3 w-3" />
                        Campaña de Captación
                    </div>
                    <h2 className="text-2xl font-bold cc-text-primary">
                        Envía una propuesta personalizada 🚀
                    </h2>
                    <p className="cc-text-secondary leading-relaxed max-w-lg">
                        Invita a administradores a conocer **ComunidadConnect**. El correo incluye 
                        detalles de IA Onboarding, Gestión Financiera y App Residente con un diseño 
                        premium para causar una excelente primera impresión.
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Diseño Premium
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Enfoque en IA
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                            Directo a Demo
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSend} className="w-full md:w-96 bg-surface p-6 rounded-xl shadow-xl border border-subtle space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold cc-text-secondary flex items-center gap-2">
                            <User className="h-4 w-4 text-brand-500" />
                            Nombre del Administrador
                        </label>
                        <Input 
                            placeholder="Ej. Pedro Picapiedra" 
                            value={formData.adminName}
                            onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                            required
                            className="bg-slate-50 border-slate-200"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold cc-text-secondary flex items-center gap-2">
                            <Mail className="h-4 w-4 text-brand-500" />
                            Email de destino
                        </label>
                        <Input 
                            type="email"
                            placeholder="correo@ejemplo.com" 
                            value={formData.adminEmail}
                            onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                            required
                            className="bg-slate-50 border-slate-200"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold cc-text-secondary flex items-center gap-2">
                            <Building className="h-4 w-4 text-brand-500" />
                            Nombre del Condominio (Opcional)
                        </label>
                        <Input 
                            placeholder="Ej. Edificio Costa del Sol" 
                            value={formData.condoName}
                            onChange={(e) => setFormData({ ...formData, condoName: e.target.value })}
                            className="bg-slate-50 border-slate-200"
                        />
                    </div>

                    {isDemoUser && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs font-medium flex items-center gap-2">
                            <Lock className="w-4 h-4 flex-shrink-0" />
                            El envío de correos está deshabilitado en esta cuenta Demo por seguridad.
                        </div>
                    )}

                    <Button 
                        type="submit" 
                        disabled={loading || isDemoUser}
                        className={`w-full text-white font-bold py-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] mt-2 group ${
                            isDemoUser ? "bg-slate-400" : "bg-gradient-to-r from-[#6D28D9] to-[#2563EB] hover:from-indigo-700 hover:to-blue-700"
                        }`}
                    >
                        {loading ? (
                            "Enviando invitación..."
                        ) : (
                            <>
                                Enviar Invitación Demo
                                <Send className="ml-2 h-4 w-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            </>
                        )}
                    </Button>
                    
                    <p className="text-[10px] text-center text-slate-400 mt-4 leading-tight">
                        Este correo será enviado desde notificaciones@send.datawiseconsultoria.com con el diseño oficial de la plataforma.
                    </p>
                </form>
            </div>
        </div>
    );
}
