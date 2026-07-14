"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Activity, Building2, Check, Copy, Search, Shield, UserRoundCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import CommercialOutreach from "@/components/admin/CommercialOutreach";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import type {
    CommercialLeadStatus,
    CommunitySubscriptionStatus,
    ProductionHealthSnapshot,
    SuperAdminCommercialLead,
    SuperAdminCommunity,
    SuperAdminDashboardResponse,
    SuperAdminPricingTier,
} from "@/lib/types";

export default function SuperAdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const [communities, setCommunities] = useState<SuperAdminCommunity[]>([]);
    const [tiers, setTiers] = useState<SuperAdminPricingTier[]>([]);
    const [leads, setLeads] = useState<SuperAdminCommercialLead[]>([]);
    const [health, setHealth] = useState<ProductionHealthSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [copiedValue, setCopiedValue] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [response, healthResponse] = await Promise.all([
                fetch('/api/superadmin/communities', { cache: 'no-store' }),
                fetch('/api/health', { cache: 'no-store' }),
            ]);
            const data = await response.json().catch(() => ({ communities: [], tiers: [], leads: [] })) as SuperAdminDashboardResponse;
            if (!response.ok) {
                if (response.status === 403 || response.status === 503) setAccessDenied(true);
                throw new Error(data.error || 'No se pudo cargar el panel');
            }

            setCommunities(data.communities || []);
            setTiers(data.tiers || []);
            setLeads(data.leads || []);
            if (healthResponse.ok) {
                setHealth(await healthResponse.json() as ProductionHealthSnapshot);
            }
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

    const handleSubscriptionChange = async (communityId: string, subscriptionStatus: CommunitySubscriptionStatus) => {
        try {
            const response = await fetch('/api/superadmin/communities', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ communityId, subscriptionStatus }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Error al actualizar la suscripcion');
            toast({ title: "Estado actualizado", description: "El ciclo comercial de la comunidad quedo actualizado.", variant: "success" });
            await fetchData();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Error al actualizar la suscripcion";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };

    const handleLeadStatusChange = async (leadId: string, leadStatus: CommercialLeadStatus) => {
        try {
            const response = await fetch('/api/superadmin/communities', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId, leadStatus }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Error al actualizar el contacto');
            setLeads(current => current.map(lead => lead.id === leadId ? { ...lead, status: leadStatus } : lead));
            toast({ title: "Contacto actualizado", description: "El seguimiento comercial quedo guardado.", variant: "success" });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Error al actualizar el contacto";
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
    const pendingLeads = leads.filter(lead => lead.status !== 'closed').length;

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
                <div className="p-6 rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center gap-4">
                        <div className="p-4 rounded-full" style={{ background: "var(--cc-plum-tint)", color: "var(--cc-plum)" }}>
                            <UserRoundCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium cc-text-secondary">Contactos por gestionar</p>
                            <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{pendingLeads}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Outreach Campaign Section */}
            <CommercialOutreach />

            <section className="grid gap-4 rounded-2xl border p-6 md:grid-cols-[1fr_auto] md:items-center" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-start gap-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: health?.runtime?.productionReady ? "var(--cc-sage-tint)" : "var(--cc-rose-tint)", color: health?.runtime?.productionReady ? "var(--cc-sage)" : "var(--cc-rose)" }}>
                        <Activity size={18} />
                    </div>
                    <div>
                        <Eyebrow className="mb-1">Salud de producción</Eyebrow>
                        <h2 className="text-xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                            {health?.runtime?.productionReady ? "Operación principal disponible" : "Revisión operativa requerida"}
                        </h2>
                        <p className="mt-2 text-sm cc-text-secondary">
                            Estado: {health?.status || "sin respuesta"}. Integraciones diferidas: {health?.runtime?.deferredProduction?.length || 0}.
                        </p>
                    </div>
                </div>
                <a href="/support" className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--cc-line)", color: "var(--cc-copper)" }}>
                    Canal de soporte
                </a>
            </section>

            <section className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="border-b p-6" style={{ borderColor: "var(--cc-line)" }}>
                    <h2 className="text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Contactos comerciales</h2>
                    <p className="mt-1 text-sm cc-text-secondary">Solicitudes reales recibidas desde activación y recorrido comercial.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead style={{ background: "var(--cc-paper-warm)" }}>
                            <tr className="cc-text-tertiary">
                                <th className="p-4">Comunidad</th>
                                <th className="p-4">Contacto</th>
                                <th className="p-4">Origen</th>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Seguimiento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cc-line)]">
                            {leads.map(lead => (
                                <tr key={lead.id}>
                                    <td className="p-4">
                                        <p className="font-semibold cc-text-primary">{lead.condo_name}</p>
                                        {lead.message && <p className="mt-1 max-w-xs truncate text-xs cc-text-tertiary" title={lead.message}>{lead.message}</p>}
                                    </td>
                                    <td className="p-4">
                                        <p className="font-medium cc-text-primary">{lead.admin_name}</p>
                                        <a className="text-xs text-[var(--cc-copper)]" href={`mailto:${lead.admin_email}`}>{lead.admin_email}</a>
                                    </td>
                                    <td className="p-4 text-xs cc-text-secondary">{lead.source.replaceAll('_', ' ')}</td>
                                    <td className="p-4 text-xs cc-text-secondary">{new Date(lead.created_at).toLocaleDateString('es-CL')}</td>
                                    <td className="p-4">
                                        <select
                                            value={lead.status}
                                            onChange={event => handleLeadStatusChange(lead.id, event.target.value as CommercialLeadStatus)}
                                            className="rounded-lg border px-3 py-2 text-xs font-semibold outline-none"
                                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                        >
                                            <option value="received">Recibido</option>
                                            <option value="notified">Notificado</option>
                                            <option value="delivery_pending">Correo pendiente</option>
                                            <option value="contacted">Contactado</option>
                                            <option value="closed">Cerrado</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                            {leads.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center cc-text-tertiary">Aún no hay solicitudes comerciales.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

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
                                            <select
                                                value={community.subscription_status}
                                                onChange={event => handleSubscriptionChange(community.id, event.target.value as CommunitySubscriptionStatus)}
                                                className="rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide outline-none"
                                                style={{ ...statusStyle, borderColor: "var(--cc-line)" }}
                                            >
                                                <option value="trialing">Prueba</option>
                                                <option value="active">Activo</option>
                                                <option value="past_due">Pago pendiente</option>
                                                <option value="canceled">Cancelado</option>
                                            </select>
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
