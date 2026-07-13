"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Building2, Shield, Check, Copy, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import CommercialOutreach from "@/components/admin/CommercialOutreach";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

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
    const [accessDenied, setAccessDenied] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [copiedValue, setCopiedValue] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/superadmin/communities', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status === 403 || response.status === 503) setAccessDenied(true);
                throw new Error(data.error || 'No se pudo cargar el panel');
            }

            setCommunities(data.communities || []);
            setTiers(data.tiers || []);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudieron cargar los datos";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/home');
            return;
        }

        if (!authLoading && user) {
            fetchData();
        }
    }, [authLoading, fetchData, router, user]);

    const handleTierChange = async (communityId: string, newTierId: string) => {
        try {
            const response = await fetch('/api/superadmin/communities', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ communityId, tierId: newTierId }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Error al actualizar el plan');
            toast({ title: "Plan actualizado", description: "El condominio ahora tiene los nuevos módulos habilitados.", variant: "success" });
            fetchData();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Error al actualizar el plan";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };

    const copyToClipboard = async (value: string, label: string) => {
        await navigator.clipboard.writeText(value);
        setCopiedValue(value);
        window.setTimeout(() => setCopiedValue(null), 1800);
        toast({ title: "Copiado", description: `${label} listo para compartir.`, variant: "success" });
    };

    if (authLoading || loading) {
        return <div className="p-8 text-center cc-text-secondary">Cargando Panel SuperAdmin...</div>;
    }

    if (accessDenied) {
        return (
            <div className="mx-auto max-w-3xl p-8">
                <div className="rounded-2xl border border-danger-border bg-danger-bg p-6">
                    <h1 className="text-xl font-semibold text-danger-fg">Acceso restringido</h1>
                    <p className="mt-2 text-sm text-danger-fg">
                        Este panel requiere que el correo este configurado en SUPERADMIN_EMAILS.
                    </p>
                </div>
            </div>
        );
    }

    const filteredCommunities = communities.filter(c => c.name?.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <Eyebrow className="mb-2 inline-flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5" style={{ color: "var(--cc-rose)" }} />
                        Consola operativa
                    </Eyebrow>
                    <DisplayHeading size={32}>Panel SuperAdmin (SaaS)</DisplayHeading>
                    <p className="cc-text-secondary mt-2 text-sm font-medium">
                        Gestiona los condominios clientes, sus planes y módulos activos.
                    </p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center gap-4">
                        <div className="p-4 rounded-full" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                            <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium cc-text-secondary">Total Condominios</p>
                            <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{communities.length}</p>
                        </div>
                    </div>
                </div>
                <div className="p-6 rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center gap-4">
                        <div className="p-4 rounded-full" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                            <Check className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium cc-text-secondary">Planes Activos</p>
                            <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                {communities.filter(c => c.subscription_status === 'active').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Outreach Campaign Section */}
            <CommercialOutreach />

            {/* Communities List */}
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="p-6 border-b flex flex-col md:flex-row justify-between gap-4" style={{ borderColor: "var(--cc-line)" }}>
                    <h2 className="text-xl font-semibold cc-text-primary flex items-center gap-2" style={{ fontFamily: "var(--cc-font-display)" }}>
                        <Building2 className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                        Directorio de Clientes
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: "var(--cc-ink-faint)" }} />
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
                        <thead className="font-medium text-sm cc-text-tertiary" style={{ background: "var(--cc-paper-warm)" }}>
                            <tr>
                                <th className="p-4">Condominio</th>
                                <th className="p-4 text-center">Plan Actual</th>
                                <th className="p-4 text-center">Estado</th>
                                <th className="p-4 text-center">Código Invitación Admin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cc-line)] text-sm">
                            {filteredCommunities.map((community) => {
                                const statusStyle = community.subscription_status === 'active'
                                    ? { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }
                                    : community.subscription_status === 'trialing'
                                        ? { background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }
                                        : { background: "var(--cc-rose-tint)", color: "var(--cc-rose)" };
                                return (
                                    <tr key={community.id} className="hover:bg-[var(--cc-paper-warm)] transition-colors">
                                        <td className="p-4 font-semibold cc-text-primary">
                                            {community.name}
                                            <div className="text-xs font-normal cc-text-tertiary flex gap-2 mt-1">
                                                <span>ID: {community.id.split('-')[0]}...</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                value={community.tier_id || ""}
                                                onChange={(e) => handleTierChange(community.id, e.target.value)}
                                                className="w-full border-none rounded-lg p-2 font-medium outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/20"
                                                style={{ background: "var(--cc-paper-warm)", color: "var(--cc-ink)" }}
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
                                            <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide" style={statusStyle}>
                                                {community.subscription_status || 'desconocido'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            {community.admin_code ? (
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(community.admin_code, "Codigo admin")}
                                                    className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-mono font-bold tracking-widest cc-text-secondary transition-colors hover:bg-[var(--cc-paper-warm)]"
                                                    style={{ background: "var(--cc-paper-warm)" }}
                                                >
                                                    {community.admin_code}
                                                    {copiedValue === community.admin_code ? <Check className="h-4 w-4" style={{ color: "var(--cc-sage)" }} /> : <Copy className="h-4 w-4" />}
                                                </button>
                                            ) : (
                                                <span className="font-mono font-bold cc-text-secondary">---</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredCommunities.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center cc-text-tertiary">
                                        No se encontraron clientes
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-2xl border p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-copper-tint)" }}>
                <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Instrucciones para Nuevos Condominios</h3>
                <p className="text-sm cc-text-secondary leading-relaxed">
                    Para registrar un nuevo administrador y su condominio, envíales este link:
                    <br/><br/>
                    <button
                        type="button"
                        onClick={() => copyToClipboard("https://conviveconnect.com/admin-onboarding", "Link de onboarding")}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-mono font-bold tracking-wider transition-colors hover:opacity-80"
                        style={{ background: "var(--cc-paper)", color: "var(--cc-copper)" }}
                    >
                        https://conviveconnect.com/admin-onboarding
                        {copiedValue === "https://conviveconnect.com/admin-onboarding" ? <Check className="h-4 w-4" style={{ color: "var(--cc-sage)" }} /> : <Copy className="h-4 w-4" />}
                    </button>
                    <br/><br/>
                    Una vez que se registren allí, aparecerán en esta lista y podrás asignarles un plan.
                </p>
            </div>
        </div>
    );
}
