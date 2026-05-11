"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { User, Mail, Shield, Trash2, Edit, Key, Copy, CheckCheck, Users, HardHat } from "lucide-react";

interface AdminProfile {
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
    units?: { number: string }[] | { number: string } | null;
}

const demoUsers: AdminProfile[] = [
    { id: "demo-admin", name: "Admin Demo", email: "admin@demo.com", role: "admin", units: null },
    { id: "demo-resident-1", name: "Andrea Dupre", email: "andrea@example.com", role: "resident", units: { number: "1204" } },
    { id: "demo-resident-2", name: "Carlos Rivas", email: "carlos@example.com", role: "resident", units: { number: "805" } },
    { id: "demo-concierge", name: "Conserje Demo", email: "conserjeria@example.com", role: "concierge", units: null },
];

export default function UsersPage() {
    const [users, setUsers] = useState<AdminProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [communityName, setCommunityName] = useState<string>("");
    const [residentCode, setResidentCode] = useState<string | null>(null);
    const [conciergeCode, setConciergeCode] = useState<string | null>(null);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const { user } = useAuth();
    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (isDemoUser) {
                    setCommunityName("Comunidad Demo");
                    setResidentCode("RES-DEMO");
                    setConciergeCode("CON-DEMO");
                    setUsers(demoUsers);
                    return;
                }

                // Fetch community codes for the admin's community
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('community_id')
                        .eq('id', user.id)
                        .single();

                    if (profile?.community_id) {
                        const { data: community } = await supabase
                            .from('communities')
                            .select('name, resident_code, concierge_code')
                            .eq('id', profile.community_id)
                            .single();

                        if (community) {
                            setCommunityName(community.name);
                            setResidentCode(community.resident_code);
                            setConciergeCode(community.concierge_code);
                        }
                    }
                }

                // Fetch users
                const { data, error } = await supabase
                    .from('profiles')
                    .select(`
                        id, 
                        name, 
                        email, 
                        role,
                        units(number)
                    `)
                    .order('name');

                if (error) throw error;
                if (data) setUsers(data);
            } catch (err) {
                console.error("Error fetching data:", err);
                setCommunityName("Comunidad Demo");
                setResidentCode("RES-DEMO");
                setConciergeCode("CON-DEMO");
                setUsers(demoUsers);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [isDemoUser, user]);

    const handleCopy = (code: string, type: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedCode(type);
            setTimeout(() => setCopiedCode(null), 2000);
        });
    };
    const residentCount = users.filter(item => item.role === "resident").length;
    const adminCount = users.filter(item => item.role === "admin").length;
    const conciergeCount = users.filter(item => item.role === "concierge").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Gestión de Usuarios</h1>
                    <p className="text-slate-500">Administra residentes, conserjes y personal.</p>
                </div>
                <Button>
                    <User className="mr-2 h-4 w-4" />
                    Nuevo Usuario
                </Button>
            </div>

            <section className="grid gap-4 md:grid-cols-4">
                {[
                    { label: "Usuarios", value: users.length, icon: <Users className="h-5 w-5" /> },
                    { label: "Residentes", value: residentCount, icon: <User className="h-5 w-5" /> },
                    { label: "Administracion", value: adminCount, icon: <Shield className="h-5 w-5" /> },
                    { label: "Conserjeria", value: conciergeCount, icon: <HardHat className="h-5 w-5" /> },
                ].map(item => (
                    <div key={item.label} className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-elevated cc-text-secondary">
                            {item.icon}
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary">{item.value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{item.label}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Invitar", description: "Comparte codigos por rol para que cada usuario entre al flujo correcto.", icon: <Key className="h-4 w-4" /> },
                        { title: "Asignar", description: "Vincula residentes con unidades para gastos, agua, reservas y casos.", icon: <User className="h-4 w-4" /> },
                        { title: "Auditar", description: "Mantiene separados permisos de administracion, residentes y conserjeria.", icon: <Shield className="h-4 w-4" /> },
                    ].map(item => (
                        <div key={item.title} className="flex gap-4 rounded-lg border border-subtle bg-elevated/40 p-4">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface cc-text-secondary">
                                {item.icon}
                            </div>
                            <div>
                                <h2 className="font-semibold cc-text-primary">{item.title}</h2>
                                <p className="mt-1 text-sm leading-6 cc-text-secondary">{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Invitation Codes Card */}
            {(residentCode || conciergeCode) && (
                <Card className="border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-800 dark:border-slate-700">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-300">
                            <Key className="h-5 w-5" />
                            Códigos de Invitación — {communityName}
                        </CardTitle>
                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                            Comparte estos códigos con los miembros de tu comunidad para que puedan registrarse en la app.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Resident Code */}
                            {residentCode && (
                                <div className="bg-surface rounded-xl border border-emerald-200 dark:border-emerald-900 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                                            <Users className="h-4 w-4 text-success-fg" />
                                        </div>
                                        <span className="text-sm font-semibold cc-text-secondary">Residentes</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-4 py-3 border border-emerald-200 dark:border-emerald-900">
                                        <span className="font-mono text-xl font-bold tracking-widest text-success-fg">
                                            {residentCode}
                                        </span>
                                        <button
                                            onClick={() => handleCopy(residentCode, 'resident')}
                                            className="ml-3 text-emerald-500 hover:text-emerald-700 transition-colors"
                                            title="Copiar código"
                                        >
                                            {copiedCode === 'resident'
                                                ? <CheckCheck className="h-5 w-5 text-emerald-600" />
                                                : <Copy className="h-5 w-5" />
                                            }
                                        </button>
                                    </div>
                                    <p className="text-xs cc-text-secondary mt-2">
                                        Para propietarios e inquilinos
                                    </p>
                                </div>
                            )}

                            {/* Concierge Code */}
                            {conciergeCode && (
                                <div className="bg-surface rounded-xl border border-orange-200 dark:border-orange-900 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                                            <HardHat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                        </div>
                                        <span className="text-sm font-semibold cc-text-secondary">Conserjes</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/30 rounded-lg px-4 py-3 border border-orange-200 dark:border-orange-900">
                                        <span className="font-mono text-xl font-bold tracking-widest text-orange-700 dark:text-orange-400">
                                            {conciergeCode}
                                        </span>
                                        <button
                                            onClick={() => handleCopy(conciergeCode, 'concierge')}
                                            className="ml-3 text-orange-500 hover:text-orange-700 transition-colors"
                                            title="Copiar código"
                                        >
                                            {copiedCode === 'concierge'
                                                ? <CheckCheck className="h-5 w-5 text-orange-600" />
                                                : <Copy className="h-5 w-5" />
                                            }
                                        </button>
                                    </div>
                                    <p className="text-xs cc-text-secondary mt-2">
                                        Para personal de conserjería
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4">Usuario</th>
                                    <th className="px-6 py-4">Rol</th>
                                    <th className="px-6 py-4">Unidad</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Cargando usuarios...</td>
                                    </tr>
                                ) : users.map((u) => {
                                    const name = u.name || 'Usuario Default';
                                    const email = u.email || 'Sin correo';
                                    const initial = name.charAt(0).toUpperCase();
                                    const unitLabel = Array.isArray(u.units) && u.units.length > 0 
                                        ? u.units[0].number 
                                        : (u.units as { number: string } | undefined)?.number || '-';

                                    return (
                                        <tr key={u.id} className="hover:bg-slate-50 group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center mr-3 text-slate-600 font-bold uppercase transition-all duration-300 group-hover:bg-brand-100 group-hover:text-brand-700">
                                                        {initial}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-900 group-hover:text-brand-700 transition-colors">{name}</p>
                                                        <div className="flex items-center text-slate-500 text-xs mt-0.5">
                                                            <Mail className="h-3 w-3 mr-1" />
                                                            {email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                            ${u.role === 'admin' ? 'bg-brand-100 text-purple-800' :
                                                        u.role === 'concierge' ? 'bg-orange-100 text-orange-800' :
                                                            'bg-emerald-100 text-emerald-800'}`}>
                                                    {u.role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 font-medium">
                                                {unitLabel}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-brand-600">
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
