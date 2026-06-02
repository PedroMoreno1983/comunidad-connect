"use client";

import { useState } from "react";
import { Mail, User, Building, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export default function CommercialOutreach() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        adminName: "",
        adminEmail: "",
        condoName: "",
    });

    const handleSend = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!formData.adminName || !formData.adminEmail) {
            toast({ title: "Faltan datos", description: "Completa el nombre y el correo.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/email/outreach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Error al enviar el correo");

            toast({ title: "Correo enviado", description: `Se envio la propuesta a ${formData.adminName}.`, variant: "success" });
            setFormData({ adminName: "", adminEmail: "", condoName: "" });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo enviar el correo";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-6 shadow-sm md:p-8">
            <div className="flex flex-col items-center gap-8 md:flex-row">
                <div className="flex-1 space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-md bg-brand-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
                        <Sparkles className="h-3 w-3" />
                        Campaña comercial
                    </div>
                    <h2 className="text-2xl font-semibold cc-text-primary">
                        Envia una propuesta personalizada
                    </h2>
                    <p className="max-w-lg leading-relaxed cc-text-secondary">
                        Invita a administradores a conocer Convive Connect. El correo incluye IA onboarding,
                        gestion financiera y app residente con un diseño comercial cuidado.
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium cc-text-secondary">
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-success-fg" />
                            Diseño oficial
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                            Enfoque operacional
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-warning-fg" />
                            Directo a reunion
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSend} className="w-full space-y-4 rounded-lg border border-subtle bg-surface p-6 shadow-sm md:w-96">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold cc-text-secondary">
                            <User className="h-4 w-4 text-brand-500" />
                            Nombre del administrador
                        </label>
                        <Input
                            placeholder="Ej. Pedro Moreno"
                            value={formData.adminName}
                            onChange={(event) => setFormData({ ...formData, adminName: event.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold cc-text-secondary">
                            <Mail className="h-4 w-4 text-brand-500" />
                            Email de destino
                        </label>
                        <Input
                            type="email"
                            placeholder="correo@ejemplo.com"
                            value={formData.adminEmail}
                            onChange={(event) => setFormData({ ...formData, adminEmail: event.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold cc-text-secondary">
                            <Building className="h-4 w-4 text-brand-500" />
                            Nombre del condominio
                        </label>
                        <Input
                            placeholder="Ej. Edificio Costa del Sol"
                            value={formData.condoName}
                            onChange={(event) => setFormData({ ...formData, condoName: event.target.value })}
                        />
                    </div>


                    <Button type="submit" disabled={loading} className="w-full" trailingIcon={<Send className="h-4 w-4" />}>
                        {loading ? "Enviando..." : "Enviar invitacion comercial"}
                    </Button>

                    <p className="text-center text-[11px] leading-5 cc-text-tertiary">
                        El correo se envia desde el remitente transaccional configurado para la plataforma.
                    </p>
                </form>
            </div>
        </div>
    );
}
