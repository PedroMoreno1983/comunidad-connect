"use client";
/* eslint-disable @next/next/no-img-element -- Profile avatars are user-uploaded Supabase assets and local previews. */

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import {
    Camera, Save, Loader2,
    Mail, Lock, CheckCircle, Smartphone, MessageCircle, ChevronRight
} from "lucide-react";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Tag as CcTag } from "@/components/cc/Tag";
import { ProfileService } from "@/lib/api";

export default function ProfilePage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [fullName, setFullName] = useState(user?.name || "");
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [isSendingReset, setIsSendingReset] = useState(false);
    const [showEmailConfirm, setShowEmailConfirm] = useState(false);

    // WhatsApp
    const [phoneNumber, setPhoneNumber] = useState("");
    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [isSavingWa, setIsSavingWa] = useState(false);

    // Unit / Dept
    const [unitNumber, setUnitNumber] = useState("");
    const [unitTower, setUnitTower] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setFullName(user.name || "");
            loadProfile();
        }
        // Profile hydration is intentionally keyed by authenticated user id.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const loadProfile = async () => {
        if (!user) return;

        const profile = await ProfileService.getSettings(user.id);
        setAvatarUrl(profile.avatarUrl);
        setPhoneNumber(profile.phoneNumber);
        setWhatsappEnabled(profile.whatsappEnabled);
        setUnitNumber(profile.unitNumber);
        setUnitTower(profile.unitTower);
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsUploadingAvatar(true);
        try {

            const publicUrl = await ProfileService.uploadAvatar(user.id, file);
            setAvatarUrl(publicUrl);
            toast({ title: "Foto actualizada", description: "Tu foto de perfil fue guardada.", variant: "success" });
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo subir la foto.", variant: "destructive" });
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user || !fullName.trim()) return;
        setIsSaving(true);
        try {
            await ProfileService.saveProfile(user.id, { fullName, unitNumber, unitTower });
            toast({ title: "Perfil actualizado", description: "Tus cambios fueron guardados.", variant: "success" });
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "No se pudo guardar el perfil.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!user?.email) return;
        setIsSendingReset(true);
        try {
            await ProfileService.sendPasswordReset(user.email, `${window.location.origin}/reset-password`);
            setShowEmailConfirm(true);
            toast({ title: "Email enviado", description: "Revisa tu correo para cambiar la contraseña.", variant: "success" });
        } catch {
            toast({ title: "Error", description: "No se pudo enviar el email.", variant: "destructive" });
        } finally {
            setIsSendingReset(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6 space-y-8">
            {/* Header */}
            <div>
                <Eyebrow className="mb-2">Ajustes</Eyebrow>
                <DisplayHeading size={40}>
                    Mi <em className="text-[var(--cc-copper)] font-serif italic font-normal">perfil</em>
                </DisplayHeading>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
                
                {/* Column 1: Profile Summary & Stats */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl p-6 flex flex-col items-center text-center shadow-sm">
                        {/* Avatar grande circular en ink con inicial en italic serif copper-soft */}
                        <div className="relative inline-block mb-4">
                            <div className="w-28 h-28 rounded-full bg-[var(--cc-ink)] flex items-center justify-center border border-[var(--cc-line-strong)] overflow-hidden shadow-inner">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-4xl font-serif italic text-[var(--cc-copper)] select-none">
                                        {fullName.charAt(0) || user?.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingAvatar}
                                className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cc-copper)] text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                                aria-label="Cambiar foto de perfil"
                            >
                                {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                        </div>

                        <h2 className="text-lg font-medium text-[var(--cc-ink)]" style={{ fontFamily: "var(--cc-font-display)" }}>
                            {fullName || user?.name}
                        </h2>
                        <p className="text-xs text-[var(--cc-ink-tertiary)] mb-4">{user?.email}</p>

                        {/* Badge "Residente verificada" con dot sage */}
                        <div className="mb-6">
                            <CcTag tone="sage" dot solid>
                                {user?.role === "admin" ? "Administrador verificado" : user?.role === "concierge" ? "Conserje verificado" : "Residente verificado"}
                            </CcTag>
                        </div>

                        {/* Stats Row (reservas / al día % / años aquí) */}
                        <div className="w-full grid grid-cols-3 gap-2 border-t border-[var(--cc-line)] pt-5 mt-2">
                            <div className="text-center">
                                <span className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Reservas</span>
                                <span className="text-base font-semibold text-[var(--cc-ink)]">12</span>
                            </div>
                            <div className="text-center border-x border-[var(--cc-line)] px-1">
                                <span className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Al día</span>
                                <span className="text-base font-semibold text-[var(--cc-sage)]">100%</span>
                            </div>
                            <div className="text-center">
                                <span className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Años</span>
                                <span className="text-base font-semibold text-[var(--cc-ink)]">2</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2-3: Form Menus & Settings */}
                <div className="md:col-span-2 space-y-8">
                    
                    {/* Tu Unidad Group */}
                    <div className="space-y-3">
                        <Eyebrow className="px-1">Tu unidad</Eyebrow>
                        <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl divide-y divide-[var(--cc-line)] overflow-hidden shadow-sm">
                            <div className="p-4 flex items-center justify-between hover:bg-[var(--cc-paper-warm)]/50 transition-colors">
                                <div className="flex-1">
                                    <label className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Número Departamento / Casa</label>
                                    <input
                                        type="text"
                                        value={unitNumber}
                                        onChange={(e) => setUnitNumber(e.target.value)}
                                        placeholder="Ej: 1204"
                                        className="w-full bg-transparent border-0 p-0 text-sm font-medium text-[var(--cc-ink)] focus:ring-0 focus:outline-none placeholder-[var(--cc-ink-tertiary)]/50"
                                    />
                                </div>
                                <ChevronRight className="h-4 w-4 text-[var(--cc-ink-tertiary)] opacity-60" />
                            </div>
                            <div className="p-4 flex items-center justify-between hover:bg-[var(--cc-paper-warm)]/50 transition-colors">
                                <div className="flex-1">
                                    <label className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Torre / Block</label>
                                    <input
                                        type="text"
                                        value={unitTower}
                                        onChange={(e) => setUnitTower(e.target.value)}
                                        placeholder="Ej: A"
                                        className="w-full bg-transparent border-0 p-0 text-sm font-medium text-[var(--cc-ink)] focus:ring-0 focus:outline-none placeholder-[var(--cc-ink-tertiary)]/50"
                                    />
                                </div>
                                <ChevronRight className="h-4 w-4 text-[var(--cc-ink-tertiary)] opacity-60" />
                            </div>
                        </div>
                    </div>

                    {/* Cuenta Group */}
                    <div className="space-y-3">
                        <Eyebrow className="px-1">Cuenta</Eyebrow>
                        <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl divide-y divide-[var(--cc-line)] overflow-hidden shadow-sm">
                            <div className="p-4 flex items-center justify-between hover:bg-[var(--cc-paper-warm)]/50 transition-colors">
                                <div className="flex-1">
                                    <label className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Nombre completo</label>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="w-full bg-transparent border-0 p-0 text-sm font-medium text-[var(--cc-ink)] focus:ring-0 focus:outline-none"
                                    />
                                </div>
                                <ChevronRight className="h-4 w-4 text-[var(--cc-ink-tertiary)] opacity-60" />
                            </div>
                            <div className="p-4 flex items-center justify-between bg-[var(--cc-paper-warm)]/30">
                                <div className="flex-1">
                                    <label className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Dirección de correo (No editable)</label>
                                    <span className="text-sm font-medium text-[var(--cc-ink-secondary)]">{user?.email}</span>
                                </div>
                                <Mail className="h-4 w-4 text-[var(--cc-ink-tertiary)] opacity-40 mr-1" />
                            </div>
                        </div>
                        <div className="pt-2">
                            <button
                                onClick={handleSaveProfile}
                                disabled={isSaving || !fullName.trim()}
                                className="w-full md:w-auto px-6 py-3 rounded-lg bg-[var(--cc-copper)] text-white font-medium text-xs uppercase tracking-wider shadow-sm hover:bg-[var(--cc-copper)]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                Guardar cambios
                            </button>
                        </div>
                    </div>

                    {/* WhatsApp Group */}
                    <div className="space-y-3">
                        <Eyebrow className="px-1">Notificaciones WhatsApp</Eyebrow>
                        <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl divide-y divide-[var(--cc-line)] overflow-hidden shadow-sm">
                            <div className="p-4 flex items-center justify-between hover:bg-[var(--cc-paper-warm)]/50 transition-colors">
                                <div className="flex-1">
                                    <label className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-0.5">Número de teléfono</label>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-sm font-medium text-[var(--cc-ink-tertiary)]">+56</span>
                                        <input
                                            type="tel"
                                            value={phoneNumber}
                                            onChange={e => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val.startsWith('56') && val.length > 9) {
                                                    val = val.substring(2);
                                                }
                                                setPhoneNumber(val.substring(0, 9));
                                            }}
                                            placeholder="912345678"
                                            className="w-full bg-transparent border-0 p-0 text-sm font-medium text-[var(--cc-ink)] focus:ring-0 focus:outline-none placeholder-[var(--cc-ink-tertiary)]/50"
                                        />
                                    </div>
                                </div>
                                <Smartphone className="h-4 w-4 text-[var(--cc-ink-tertiary)] opacity-60" />
                            </div>
                            <div className="p-4 flex items-center justify-between hover:bg-[var(--cc-paper-warm)]/50 transition-colors">
                                <div>
                                    <p className="text-sm font-medium text-[var(--cc-ink)]">Activar notificaciones</p>
                                    <p className="text-xs text-[var(--cc-ink-tertiary)] mt-0.5">Recibirás avisos, pagos y mensajes importantes</p>
                                </div>
                                <button
                                    onClick={() => setWhatsappEnabled(v => !v)}
                                    className={`relative h-5.5 w-11 rounded-full transition-colors ${whatsappEnabled ? 'bg-[var(--cc-sage)]' : 'bg-[var(--cc-line-strong)]'}`}
                                    aria-label="Activar notificaciones WhatsApp"
                                >
                                    <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all ${whatsappEnabled ? 'right-0.5' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>
                        <div className="pt-2">
                            <button
                                onClick={async () => {
                                    if (!user || phoneNumber.length < 9) {
                                        toast({ title: 'Error', description: 'Ingresa un número de 9 dígitos.', variant: 'destructive' });
                                        return;
                                    }
                                    setIsSavingWa(true);
                                    try {
                                        await ProfileService.saveWhatsapp(user.id, phoneNumber, whatsappEnabled);
                                        toast({ title: 'WhatsApp guardado', description: whatsappEnabled ? 'Recibirás notificaciones en tu WhatsApp.' : 'Notificaciones desactivadas.', variant: 'success' });
                                    } catch {
                                        toast({ title: 'Error', description: 'No se pudo guardar el número.', variant: 'destructive' });
                                    }
                                    setIsSavingWa(false);
                                }}
                                disabled={isSavingWa || !phoneNumber}
                                className="w-full md:w-auto px-6 py-3 rounded-lg bg-[var(--cc-sage)] text-white font-medium text-xs uppercase tracking-wider shadow-sm hover:bg-[var(--cc-sage)]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSavingWa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                Guardar WhatsApp
                            </button>
                        </div>
                    </div>

                    {/* Seguridad Group */}
                    <div className="space-y-3">
                        <Eyebrow className="px-1">Seguridad</Eyebrow>
                        {showEmailConfirm ? (
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--cc-sage-tint)] border border-[var(--cc-sage)]/30">
                                <CheckCircle className="h-5 w-5 text-[var(--cc-sage)] mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-[var(--cc-sage)]">Email de restablecimiento enviado</p>
                                    <p className="text-xs text-[var(--cc-ink-secondary)] mt-1 leading-relaxed">
                                        Revisa tu bandeja de entrada en <strong>{user?.email}</strong> para cambiar la contraseña.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                                <div>
                                    <p className="text-sm font-medium text-[var(--cc-ink)]">Cambio de contraseña</p>
                                    <p className="text-xs text-[var(--cc-ink-tertiary)] mt-0.5">Te enviaremos un link para actualizar tus credenciales de forma segura</p>
                                </div>
                                <button
                                    onClick={handlePasswordReset}
                                    disabled={isSendingReset}
                                    className="px-4 py-2.5 rounded-lg border border-[var(--cc-rose)]/30 bg-[var(--cc-rose-tint)] text-[var(--cc-rose)] text-xs font-semibold hover:bg-[var(--cc-rose-tint)]/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 self-start sm:self-auto"
                                >
                                    {isSendingReset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                                    Cambiar contraseña
                                </button>
                            </div>
                        )}
                    </div>

                </div>

            </div>
        </div>
    );
}
