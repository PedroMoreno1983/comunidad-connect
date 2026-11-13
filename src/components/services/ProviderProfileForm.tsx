"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ProviderProfileFormProps, ProviderProfileInput, ServiceProvider } from "@/lib/types";

const AVAILABILITY: Array<{ value: ServiceProvider["availability"]; label: string }> = [
    { value: "available", label: "Disponible" },
    { value: "busy", label: "Con poca disponibilidad" },
    { value: "unavailable", label: "No disponible por ahora" },
];

const field = "mt-1 w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" };

/**
 * Formulario del perfil de proveedor. Lo usan el panel del proveedor con cuenta,
 * la administración y el portal del maestro externo.
 */
export function ProviderProfileForm({ initial, onSubmit, onCancel, submitLabel = "Guardar perfil" }: ProviderProfileFormProps) {
    const [form, setForm] = useState({
        name: initial.name ?? "",
        contactPhone: initial.contactPhone ?? "",
        email: initial.email ?? "",
        bio: initial.bio ?? "",
        yearsExperience: String(initial.yearsExperience ?? 0),
        hourlyRate: initial.hourlyRate == null ? "" : String(initial.hourlyRate),
        specialties: (initial.specialties ?? []).join(", "),
        certifications: (initial.certifications ?? []).join(", "),
        availability: initial.availability ?? "available",
        responseTime: initial.responseTime ?? "",
        serviceAddress: initial.serviceAddress ?? "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(current => ({ ...current, [key]: event.target.value }));
    const split = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        const input: ProviderProfileInput = {
            name: form.name,
            contactPhone: form.contactPhone,
            email: form.email,
            bio: form.bio,
            yearsExperience: Number(form.yearsExperience) || 0,
            hourlyRate: form.hourlyRate.trim() ? Number(form.hourlyRate.replace(/[^0-9]/g, "")) : null,
            specialties: split(form.specialties),
            certifications: split(form.certifications),
            availability: form.availability as ServiceProvider["availability"],
            responseTime: form.responseTime,
            serviceAddress: form.serviceAddress,
        };
        // Si la pantalla no trajo la zona de trabajo y nadie la escribió, no se
        // manda: un campo vacío borraría la que ya estaba guardada.
        if (initial.serviceAddress === undefined && !form.serviceAddress.trim()) delete input.serviceAddress;
        try {
            await onSubmit(input);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "No se pudo guardar.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold cc-text-secondary">Nombre
                <input required minLength={2} maxLength={120} className={field} style={fieldStyle} value={form.name} onChange={set("name")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Teléfono
                <input required className={field} style={fieldStyle} placeholder="+56 9 1234 5678" value={form.contactPhone} onChange={set("contactPhone")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Correo
                <input type="email" className={field} style={fieldStyle} value={form.email} onChange={set("email")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Comuna o zona de trabajo
                <input maxLength={160} className={field} style={fieldStyle} placeholder="Ñuñoa, Providencia" value={form.serviceAddress} onChange={set("serviceAddress")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Tarifa por hora (CLP)
                <input inputMode="numeric" className={field} style={fieldStyle} placeholder="15000" value={form.hourlyRate} onChange={set("hourlyRate")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Años de experiencia
                <input type="number" min={0} max={70} className={field} style={fieldStyle} value={form.yearsExperience} onChange={set("yearsExperience")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Disponibilidad
                <select className={field} style={fieldStyle} value={form.availability} onChange={set("availability")}>
                    {AVAILABILITY.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
            </label>
            <label className="text-xs font-semibold cc-text-secondary">Tiempo de respuesta
                <input maxLength={60} className={field} style={fieldStyle} placeholder="< 2 horas" value={form.responseTime} onChange={set("responseTime")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary sm:col-span-2">Especialidades (separadas por coma)
                <input className={field} style={fieldStyle} placeholder="Reparación de cañerías, calefont" value={form.specialties} onChange={set("specialties")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary sm:col-span-2">Certificaciones (separadas por coma)
                <input className={field} style={fieldStyle} placeholder="Certificación SEC Clase A" value={form.certifications} onChange={set("certifications")} />
            </label>
            <label className="text-xs font-semibold cc-text-secondary sm:col-span-2">Sobre tu trabajo
                <textarea maxLength={1200} className={`${field} min-h-24`} style={fieldStyle} value={form.bio} onChange={set("bio")} />
            </label>
            {error && <p className="text-sm sm:col-span-2" style={{ color: "var(--cc-rose)" }}>{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--cc-copper)" }}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
                </button>
                {onCancel && (
                    <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-2 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line-strong)" }}>
                        Cancelar
                    </button>
                )}
            </div>
        </form>
    );
}
