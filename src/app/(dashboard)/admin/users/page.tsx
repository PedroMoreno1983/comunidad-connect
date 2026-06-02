"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
    CheckCheck,
    Copy,
    HardHat,
    Key,
    Mail,
    Search,
    Shield,
    User,
    UserPlus,
    Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleHeader, ModuleStat } from "@/components/ui/ModuleHeader";

type RoleFilter = "all" | "admin" | "resident" | "concierge";

interface AdminProfile {
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
    units?: { number: string }[] | { number: string } | null;
}

const roleLabels: Record<string, string> = {
    admin: "Administración",
    resident: "Residente",
    concierge: "Conserjería",
};

const roleVariants: Record<string, "admin" | "residente" | "conserje" | "neutral"> = {
    admin: "admin",
    resident: "residente",
    concierge: "conserje",
};

function getUnitLabel(units: AdminProfile["units"]) {
    if (Array.isArray(units) && units.length > 0) return units[0].number;
    if (units && !Array.isArray(units)) return units.number;
    return "-";
}

function getOperationalStatus(profile: AdminProfile) {
    if (!profile.email) return { label: "Sin correo", variant: "warning" as const };
    if (profile.role === "resident" && getUnitLabel(profile.units) === "-") {
        return { label: "Falta unidad", variant: "warning" as const };
    }
    return { label: "Activo", variant: "success" as const };
}

export default function UsersPage() {
    const { user } = useAuth();
    const [users, setUsers] = useState<AdminProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [communityName, setCommunityName] = useState("Comunidad");
    const [residentCode, setResidentCode] = useState<string | null>(null);
    const [conciergeCode, setConciergeCode] = useState<string | null>(null);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
    const [query, setQuery] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                if (user) {
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("community_id")
                        .eq("id", user.id)
                        .single();

                    if (profile?.community_id) {
                        const { data: community } = await supabase
                            .from("communities")
                            .select("name, resident_code, concierge_code")
                            .eq("id", profile.community_id)
                            .single();

                        if (community) {
                            setCommunityName(community.name || "Comunidad");
                            setResidentCode(community.resident_code);
                            setConciergeCode(community.concierge_code);
                        }
                    }
                }

                const { data, error } = await supabase
                    .from("profiles")
                    .select("id, name, email, role, units(number)")
                    .order("name");

                if (error) throw error;
                setUsers((data || []) as AdminProfile[]);
            } catch (err) {
                console.error("Error fetching users:", err);
                setUsers([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const stats = useMemo(() => {
        const residents = users.filter(item => item.role === "resident").length;
        const admins = users.filter(item => item.role === "admin").length;
        const concierge = users.filter(item => item.role === "concierge").length;
        const missingUnit = users.filter(item => item.role === "resident" && getUnitLabel(item.units) === "-").length;

        return { residents, admins, concierge, missingUnit, total: users.length };
    }, [users]);

    const filteredUsers = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        return users.filter(item => {
            const matchesRole = roleFilter === "all" || item.role === roleFilter;
            const searchable = [
                item.name,
                item.email,
                roleLabels[item.role || ""],
                getUnitLabel(item.units),
            ].filter(Boolean).join(" ").toLowerCase();

            return matchesRole && (!normalized || searchable.includes(normalized));
        });
    }, [query, roleFilter, users]);

    const handleCopy = (code: string, type: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedCode(type);
            setTimeout(() => setCopiedCode(null), 2000);
        });
    };

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <ModuleHeader
                eyebrow="Administración"
                title="Usuarios y accesos"
                description="Controla roles, unidades asignadas y codigos de invitacion desde una vista operativa."
                icon={<Users className="h-5 w-5" />}
                meta={`${communityName} · ${stats.total} usuarios registrados`}
                actions={
                    <Link
                        href="/admin/onboarding"
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-medium leading-none text-white shadow-sm transition-colors hover:bg-brand-600"
                    >
                        <UserPlus className="h-4 w-4" />
                            Nuevo usuario
                    </Link>
                }
            />

            <section className="grid gap-3 md:grid-cols-5">
                <ModuleStat label="Total" value={stats.total} icon={<Users className="h-4 w-4" />} active={roleFilter === "all"} onClick={() => setRoleFilter("all")} />
                <ModuleStat label="Residentes" value={stats.residents} icon={<User className="h-4 w-4" />} active={roleFilter === "resident"} onClick={() => setRoleFilter("resident")} />
                <ModuleStat label="Administración" value={stats.admins} icon={<Shield className="h-4 w-4" />} active={roleFilter === "admin"} onClick={() => setRoleFilter("admin")} />
                <ModuleStat label="Conserjería" value={stats.concierge} icon={<HardHat className="h-4 w-4" />} active={roleFilter === "concierge"} onClick={() => setRoleFilter("concierge")} />
                <ModuleStat label="Pendientes" value={stats.missingUnit} icon={<Key className="h-4 w-4" />} />
            </section>

            {(residentCode || conciergeCode) && (
                <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary">Codigos de invitacion</h2>
                            <p className="text-sm cc-text-secondary">Comparte cada codigo segun el rol que debe activar la persona.</p>
                        </div>
                        <Badge variant="info">Onboarding controlado</Badge>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        {residentCode && (
                            <InviteCodeCard
                                title="Residentes"
                                description="Propietarios, arrendatarios e integrantes de una unidad."
                                code={residentCode}
                                copied={copiedCode === "resident"}
                                onCopy={() => handleCopy(residentCode, "resident")}
                                icon={<Users className="h-4 w-4" />}
                            />
                        )}
                        {conciergeCode && (
                            <InviteCodeCard
                                title="Conserjería"
                                description="Personal de turno, accesos, visitas y paqueteria."
                                code={conciergeCode}
                                copied={copiedCode === "concierge"}
                                onCopy={() => handleCopy(conciergeCode, "concierge")}
                                icon={<HardHat className="h-4 w-4" />}
                            />
                        )}
                    </div>
                </section>
            )}

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="grid gap-3 border-b border-subtle p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar por nombre, correo, rol o unidad"
                            className="h-11 w-full rounded-lg border border-subtle bg-canvas pl-10 pr-4 text-sm font-medium outline-none transition-colors focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(["all", "resident", "admin", "concierge"] as RoleFilter[]).map(filter => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setRoleFilter(filter)}
                                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                    roleFilter === filter
                                        ? "bg-slate-950 text-white"
                                        : "bg-elevated cc-text-secondary hover:bg-surface"
                                }`}
                            >
                                {filter === "all" ? "Todos" : roleLabels[filter]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="border-b border-subtle bg-elevated/50 text-[11px] font-bold uppercase tracking-[0.12em] cc-text-secondary">
                            <tr>
                                <th className="px-5 py-3">Usuario</th>
                                <th className="px-5 py-3">Rol</th>
                                <th className="px-5 py-3">Unidad</th>
                                <th className="px-5 py-3">Estado</th>
                                <th className="px-5 py-3 text-right">Siguiente accion</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center text-sm font-semibold cc-text-secondary">
                                        Cargando usuarios...
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-6">
                                        <EmptyState
                                            icon={<Search className="h-6 w-6" />}
                                            title="Sin resultados"
                                            description="Ajusta el filtro o busca por otro nombre, correo o unidad."
                                            dashed={false}
                                        />
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(profile => {
                                    const name = profile.name || "Usuario sin nombre";
                                    const email = profile.email || "Sin correo";
                                    const unitLabel = getUnitLabel(profile.units);
                                    const role = profile.role || "resident";
                                    const status = getOperationalStatus(profile);

                                    return (
                                        <tr key={profile.id} className="transition-colors hover:bg-elevated/50">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                                                        {name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold cc-text-primary">{name}</p>
                                                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs cc-text-secondary">
                                                            <Mail className="h-3.5 w-3.5 shrink-0" />
                                                            {email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <Badge variant={roleVariants[role] || "neutral"}>{roleLabels[role] || role}</Badge>
                                            </td>
                                            <td className="px-5 py-4 font-semibold cc-text-secondary">
                                                {unitLabel === "-" ? "Sin asignar" : `Depto ${unitLabel}`}
                                            </td>
                                            <td className="px-5 py-4">
                                                <Badge variant={status.variant}>{status.label}</Badge>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <Link
                                                    href={status.variant === "warning" ? "/admin/units" : "/admin/onboarding"}
                                                    className="inline-flex items-center justify-center rounded-md border border-subtle bg-elevated px-3 py-1.5 text-[13px] font-medium cc-text-primary transition-colors hover:bg-surface"
                                                >
                                                    {status.variant === "warning" ? "Asignar unidad" : "Ver onboarding"}
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function InviteCodeCard({
    title,
    description,
    code,
    copied,
    onCopy,
    icon,
}: {
    title: string;
    description: string;
    code: string;
    copied: boolean;
    onCopy: () => void;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-lg border border-subtle bg-elevated/40 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface cc-text-secondary">
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-semibold cc-text-primary">{title}</h3>
                        <p className="mt-1 text-sm leading-5 cc-text-secondary">{description}</p>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface px-4 py-3">
                <span className="min-w-0 truncate font-mono text-lg font-bold tracking-[0.16em] cc-text-primary">{code}</span>
                <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-subtle bg-elevated cc-text-secondary transition-colors hover:bg-surface"
                    aria-label={`Copiar codigo ${title}`}
                >
                    {copied ? <CheckCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}
