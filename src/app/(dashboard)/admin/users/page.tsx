"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { User, Mail, Shield, Trash2, Edit } from "lucide-react";

export default function UsersPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select(`
                        id, 
                        full_name, 
                        email, 
                        role,
                        units(number)
                    `)
                    .order('full_name');

                if (data) {
                    setUsers(data);
                }
            } catch (err) {
                console.error("Error fetching users:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUsers();
    }, []);

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
                                    const name = u.full_name || 'Usuario Default';
                                    const email = u.email || 'Sin correo';
                                    const initial = name.charAt(0).toUpperCase();
                                    const unitLabel = Array.isArray(u.units) && u.units.length > 0 ? u.units[0].number : (u.units as any)?.number || '-';

                                    return (
                                        <tr key={u.id} className="hover:bg-slate-50 group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center mr-3 text-slate-600 font-bold uppercase transition-all duration-300 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                                                        {initial}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-900 group-hover:text-indigo-700 transition-colors">{name}</p>
                                                        <div className="flex items-center text-slate-500 text-xs mt-0.5">
                                                            <Mail className="h-3 w-3 mr-1" />
                                                            {email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                            ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
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
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600">
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
