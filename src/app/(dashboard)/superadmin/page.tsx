"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { Building2, Shield, Settings, Check, X, Search, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import OutreachDemo from "@/components/admin/OutreachDemo";

interface PricingTier {
    id: string;
    name: string;
    price_per_unit: number;
    base_price: number;
    features: Record<string, boolean>;
}

interface Community {
    id: string;
    name: string;
    address: string;
    tier_id: string;
    subscription_status: string;
    admin_code: string;
    resident_code: string;
    created_at: string;
}

export default function SuperAdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const [communities, setCommunities] = useState<Community[]>([]);
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Verification that Pedro is the superadmin
    // (In production, use a secure backend check or a specific superadmin role)
    const isSuperAdmin = user?.email === 'pedromoreno1983@gmail.com' || user?.email?.includes('comunidadconnect');

    useEffect(() => {
        if (!authLoading && !isSuperAdmin) {
            toast({ title: "Acceso Denegado", description: "No tienes permisos de Super Administrador", variant: "destructive" });
            router.push('/home');
            return;
        }

        if (isSuperAdmin) {
            fetchData();
        }
    }, [authLoading, isSuperAdmin]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [commRes, tiersRes] = await Promise.all([
                supabase.from('communities').select('*').order('created_at', { ascending: false }),
                supabase.from('pricing_tiers').select('*').order('price_per_unit', { ascending: true })
            ]);

            if (commRes.error) throw commRes.error;
            if (tiersRes.error) throw tiersRes.error;

            setCommunities(commRes.data || []);
            setTiers(tiersRes.data || []);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudieron cargar los datos";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleTierChange = async (communityId: string, newTierId: string) => {
        try {
            const { error } = await supabase
                .from('communities')
                .update({ tier_id: newTierId })
                .eq('id', communityId);

            if (error) throw error;
            toast({ title: "Plan actualizado", description: "El condominio ahora tiene los nuevos módulos habilitados.", variant: "success" });
            fetchData();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Error al actualizar el plan";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };

    if (authLoading || loading) {
        return <div className="p-8 text-center text-slate-500">Cargando Panel SuperAdmin...</div>;
    }

    if (!isSuperAdmin) return null;

    const filteredCommunities = communities.filter(c => c.name?.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent flex items-center gap-3">
                        <Shield className="h-8 w-8 text-red-500" />
                        Panel SuperAdmin (SaaS)
                    </h1>
                    <p className="cc-text-secondary mt-2">
                        Gestiona los condominios clientes, sus planes y módulos activos.
                    </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-subtle">
                    <div className="flex items-center gap-4">
                        <div className="p-4 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                            <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Total Condominios</p>
                            <p className="text-2xl font-bold cc-text-primary">{communities.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-surface p-6 rounded-2xl shadow-sm border border-subtle">
                    <div className="flex items-center gap-4">
                        <div className="p-4 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
                            <Check className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Planes Activos</p>
                            <p className="text-2xl font-bold cc-text-primary">
                                {communities.filter(c => c.subscription_status === 'active').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Outreach Campaign Section */}
            <OutreachDemo />

            {/* Communities List */}
            <div className="bg-surface rounded-2xl shadow-xl overflow-hidden border border-subtle">
                <div className="p-6 border-b border-subtle flex flex-col md:flex-row justify-between gap-4">
                    <h2 className="text-xl font-bold cc-text-primary flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-indigo-500" />
                        Directorio de Clientes
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input 
                            placeholder="Buscar condominio..." 
                            className="pl-10 w-full md:w-64"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-canvas/50 text-slate-500 font-medium text-sm">
                            <tr>
                                <th className="p-4">Condominio</th>
                                <th className="p-4 text-center">Plan Actual</th>
                                <th className="p-4 text-center">Estado</th>
                                <th className="p-4 text-center">Código Invitación Admin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                            {filteredCommunities.map((community) => {
                                const currentTier = tiers.find(t => t.id === community.tier_id);
                                return (
                                    <tr key={community.id} className="hover:bg-elevated/50 transition-colors">
                                        <td className="p-4 font-semibold cc-text-primary">
                                            {community.name}
                                            <div className="text-xs font-normal text-slate-500 flex gap-2 mt-1">
                                                <span>ID: {community.id.split('-')[0]}...</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <select 
                                                value={community.tier_id || ""}
                                                onChange={(e) => handleTierChange(community.id, e.target.value)}
                                                className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg p-2 font-medium text-role-admin-fg focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="" disabled>Selecciona un plan</option>
                                                {tiers.map(t => (
                                                    <option key={t.id} value={t.id}>
                                                        {t.name} (Base: ${t.base_price})
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                                                ${community.subscription_status === 'active' 
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                                                    : community.subscription_status === 'trialing'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                                }`}>
                                                {community.subscription_status || 'desconocido'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center cc-text-secondary font-mono font-bold tracking-widest bg-canvas rounded-lg">
                                            {community.admin_code || '---'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredCommunities.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500">
                                        No se encontraron clientes
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-300 mb-2">Instrucciones para Nuevos Condominios</h3>
                <p className="text-sm text-blue-800 dark:text-blue-400 leading-relaxed">
                    Para registrar un nuevo administrador y su condominio, envíales este link:
                    <br/><br/>
                    <code className="bg-surface px-3 py-2 rounded-lg font-mono font-bold select-all tracking-wider text-blue-600 dark:text-blue-400 shadow-sm">
                        https://comunidadconnect.com/admin-onboarding
                    </code>
                    <br/><br/>
                    Una vez que se registren allí, aparecerán en esta lista y podrás asignarles un plan.
                </p>
            </div>
        </div>
    );
}
