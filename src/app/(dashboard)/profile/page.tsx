"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import {
    User, Camera, Save, Loader2, ShieldCheck,
    Home, Mail, Lock, CheckCircle, Smartphone, MessageCircle
} from "lucide-react";

export default function ProfilePage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [fullName, setFullName] = useState(user?.name || "");
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [isSendingReset, setIsSendingReset] = useState(false);
    const [passwordResetSent, setPasswordResetSent] = useState(false);
    const [showEmailConfirm, setShowEmailConfirm] = useState(false);

    // WhatsApp
    const [phoneNumber, setPhoneNumber] = useState("");
    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [isSavingWa, setIsSavingWa] = useState(false);

    // Unit / Dept
    const [unitNumber, setUnitNumber] = useState("");
    const [unitTower, setUnitTower] = useState("");
    const [isSavingUnit, setIsSavingUnit] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setFullName(user.name || "");
            loadProfile();
        }
    }, [user?.id]);

    const loadProfile = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('profiles')
            .select('name, avatar_url, phone_number, whatsapp_enabled')
            .eq('id', user.id)
            .maybeSingle();
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        if (data?.phone_number) {
            // Remove +56 for the input field
            setPhoneNumber(data.phone_number.replace('+56', ''));
        }
        if (data?.whatsapp_enabled) setWhatsappEnabled(data.whatsapp_enabled);

        // Load unit info
        const { data: unitData } = await supabase
            .from('units')
            .select('number, tower')
            .eq('owner_id', user.id)
            .maybeSingle();

        if (unitData) {
            setUnitNumber(unitData.number || "");
            setUnitTower(unitData.tower || "");
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsUploadingAvatar(true);
        try {
            const ext = file.name.split('.').pop();
            const path = `avatars/${user.id}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(path, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(path);

            // Save to profile
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
            setAvatarUrl(publicUrl);
            toast({ title: "✅ Foto actualizada", description: "Tu foto de perfil fue guardada.", variant: "success" });
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
            // Update profile
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ name: fullName.trim() })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // Update unit info
            if (unitNumber.trim()) {
                // Check if user already has a unit assigned
                const { data: existingUnit } = await supabase
                    .from('units')
                    .select('id')
                    .eq('owner_id', user.id)
                    .maybeSingle();

                if (existingUnit) {
                    await supabase
                        .from('units')
                        .update({ number: unitNumber.trim(), tower: unitTower.trim() })
                        .eq('id', existingUnit.id);
                } else {
                    // Try to find if the unit number already exists but is unowned
                    const { data: foundUnit } = await supabase
                        .from('units')
                        .select('id')
                        .eq('number', unitNumber.trim())
                        .is('owner_id', null)
                        .maybeSingle();
                    
                    if (foundUnit) {
                        await supabase
                            .from('units')
                            .update({ owner_id: user.id, tower: unitTower.trim() })
                            .eq('id', foundUnit.id);
                    } else {
                        // Create new unit (as fallback for demo/enrollment flow)
                        await supabase
                            .from('units')
                            .insert({ 
                                number: unitNumber.trim(), 
                                tower: unitTower.trim(), 
                                owner_id: user.id,
                                floor: parseInt(unitNumber.substring(0, 1)) || 1 
                            });
                    }
                }
            }

            toast({ title: "✅ Perfil actualizado", description: "Tus cambios fueron guardados.", variant: "success" });
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
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: `${window.location.origin}/reset-password`
            });
            if (error) throw error;
            setPasswordResetSent(true);
            setShowEmailConfirm(true);
            toast({ title: "📧 Email enviado", description: "Revisa tu correo para cambiar la contraseña.", variant: "success" });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo enviar el email.", variant: "destructive" });
        } finally {
            setIsSendingReset(false);
        }
    };

    const ROLE_LABEL: Record<string, string> = {
        admin: 'Administrador',
        resident: 'Residente',
        concierge: 'Conserjería'
    };

    const ROLE_GRADIENT: Record<string, string> = {
        admin: 'from-[#7C3AED] to-[#5B21B6]',
        resident: 'from-[#10B981] to-[#0D9488]',
        concierge: 'from-[#F59E0B] to-[#F97316]'
    };

    const gradient = ROLE_GRADIENT[user?.role || 'resident'];

    return (
        <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6 space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className={`p-3 bg-gradient-to-br ${gradient} rounded-2xl shadow-lg`}>
                    <User className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-black cc-text-primary">Mi Perfil</h1>
                    <p className="text-sm font-medium text-slate-500">Gestiona tu información personal</p>
                </div>
            </div>

            {/* Avatar Section */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface rounded-3xl border border-subtle shadow-lg shadow-slate-200/40 dark:shadow-none overflow-hidden"
            >
                {/* Banner */}
                <div className={`h-24 bg-gradient-to-r ${gradient} relative`}>
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                </div>

                <div className="px-8 pb-8">
                    {/* Avatar */}
                    <div className="relative -mt-12 inline-block mb-4">
                        <div className={`w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} border-4 border-white dark:border-slate-800 shadow-xl`}>
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-white">
                                    {user?.name?.charAt(0) || '?'}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingAvatar}
                            className="absolute -bottom-2 -right-2 p-2 bg-brand-500 text-white rounded-xl shadow-lg hover:bg-brand-600 transition-colors disabled:opacity-60"
                        >
                            {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>

                    <div className="flex flex-wrap gap-3 mb-6">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${gradient} text-white shadow-sm`}>
                            <ShieldCheck className="h-3 w-3" />
                            {ROLE_LABEL[user?.role || 'resident']}
                        </span>
                        {user?.unitName && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-elevated cc-text-secondary">
                                <Home className="h-3 w-3" />
                                {user.unitName}
                            </span>
                        )}
                    </div>

                    {/* Full Name input */}
                    <div className="space-y-2 mb-6">
                        <label className="text-sm font-bold cc-text-secondary">Nombre completo</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-canvas border border-subtle text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        />
                    </div>

                    {/* Email (read-only) */}
                    <div className="space-y-2 mb-6">
                        <label className="text-sm font-bold cc-text-secondary">Email</label>
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-canvas border border-subtle">
                            <Mail className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium cc-text-secondary">{user?.email}</span>
                        </div>
                    </div>

                    {/* Unit Info (Enrollment) */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold cc-text-secondary">N° Depto / Casa</label>
                            <input
                                type="text"
                                value={unitNumber}
                                onChange={(e) => setUnitNumber(e.target.value)}
                                placeholder="Ej: 402"
                                className="w-full px-4 py-3 rounded-2xl bg-canvas border border-subtle text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold cc-text-secondary">Torre / Block</label>
                            <input
                                type="text"
                                value={unitTower}
                                onChange={(e) => setUnitTower(e.target.value)}
                                placeholder="Ej: A"
                                className="w-full px-4 py-3 rounded-2xl bg-canvas border border-subtle text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSaveProfile}
                        disabled={isSaving || !fullName.trim()}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r ${gradient} text-white font-bold text-sm shadow-md hover:scale-[1.01] transition-transform disabled:opacity-60 disabled:scale-100`}
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Guardar cambios
                    </button>
                </div>
            </motion.div>

            {/* WhatsApp Section */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-surface rounded-3xl border border-subtle p-8 shadow-lg shadow-slate-200/40 dark:shadow-none"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-success-bg rounded-xl">
                        <MessageCircle className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="font-black cc-text-primary">Notificaciones WhatsApp</h2>
                        <p className="text-xs text-slate-400">Recibe avisos importantes en tu WhatsApp</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-bold cc-text-secondary">Número de WhatsApp</label>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-3 rounded-2xl bg-canvas border border-subtle">
                                <Smartphone className="h-4 w-4 text-slate-400" />
                                <span className="text-sm font-bold text-slate-400">+56</span>
                            </div>
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
                                className="flex-1 px-4 py-3 rounded-2xl bg-canvas border border-subtle text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            />
                        </div>
                        <p className="text-xs text-slate-400">Ingresa los 9 dígitos de tu móvil (ej: 912345678)</p>
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-canvas border border-subtle">
                        <div>
                            <p className="text-sm font-bold cc-text-primary">Activar notificaciones</p>
                            <p className="text-xs text-slate-400">Recibirás avisos, pagos y mensajes por WhatsApp</p>
                        </div>
                        <button
                            onClick={() => setWhatsappEnabled(v => !v)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${whatsappEnabled ? 'bg-emerald-500' : 'bg-elevated'
                                }`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${whatsappEnabled ? 'translate-x-6' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>

                    <button
                        onClick={async () => {
                            if (!user || phoneNumber.length < 9) {
                                toast({ title: 'Error', description: 'Ingresa un número de 9 dígitos.', variant: 'destructive' });
                                return;
                            }
                            setIsSavingWa(true);
                            const fullPhone = `+56${phoneNumber}`;
                            const { error } = await supabase.from('profiles').update({
                                phone_number: fullPhone,
                                whatsapp_enabled: whatsappEnabled
                            }).eq('id', user.id);
                            if (!error) {
                                toast({ title: '✅ WhatsApp guardado', description: whatsappEnabled ? 'Recibirás notificaciones en tu WhatsApp.' : 'Notificaciones desactivadas.', variant: 'success' });
                            } else {
                                toast({ title: 'Error', description: 'No se pudo guardar el número.', variant: 'destructive' });
                            }
                            setIsSavingWa(false);
                        }}
                        disabled={isSavingWa || !phoneNumber}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#10B981] to-[#0D9488] text-white font-bold text-sm shadow-md hover:scale-[1.01] transition-transform disabled:opacity-60 disabled:scale-100"
                    >
                        {isSavingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                        Guardar WhatsApp
                    </button>
                </div>
            </motion.div>

            {/* Security Section */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-surface rounded-3xl border border-subtle p-8 shadow-lg shadow-slate-200/40 dark:shadow-none"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-danger-bg rounded-xl">
                        <Lock className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                        <h2 className="font-black cc-text-primary">Seguridad</h2>
                        <p className="text-xs text-slate-400">Gestiona tu contraseña</p>
                    </div>
                </div>

                {showEmailConfirm ? (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-success-bg border border-emerald-200 dark:border-emerald-500/20">
                        <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-success-fg">Email enviado</p>
                            <p className="text-xs text-success-fg mt-0.5">
                                Revisa tu bandeja en <strong>{user?.email}</strong> para cambiar la contraseña.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm font-medium cc-text-secondary">
                            Te enviaremos un link a <strong>{user?.email}</strong> para que puedas cambiar tu contraseña de forma segura.
                        </p>
                        <button
                            onClick={handlePasswordReset}
                            disabled={isSendingReset}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-danger-bg border border-red-200 dark:border-red-500/20 text-danger-fg text-sm font-bold hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-60"
                        >
                            {isSendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                            Cambiar contraseña
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
