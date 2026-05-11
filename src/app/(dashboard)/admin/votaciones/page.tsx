"use client";

import { PollManager } from "@/components/admin/PollManager";
import { Activity, Calendar, ShieldCheck, Users } from "lucide-react";

export default function AdminVotacionesPage() {
    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <header className="flex flex-col justify-between gap-5 border-b border-subtle pb-6 md:flex-row md:items-end">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Participacion comunitaria</p>
                    <h1 className="mt-2 text-3xl font-semibold cc-text-primary">Gestion de votaciones</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Crea consultas formales, publicalas en el chat general y distribuyelas por notificaciones o WhatsApp a residentes habilitados.
                    </p>
                </div>

                <button className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2.5 text-sm font-semibold cc-text-primary shadow-sm transition-colors hover:bg-elevated">
                    <Calendar className="h-4 w-4 cc-text-secondary" />
                    Historial legal
                </button>
            </header>

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="flex items-center gap-3 border-b border-subtle p-5">
                    <ShieldCheck className="h-5 w-5 text-slate-500" />
                    <h2 className="text-lg font-semibold cc-text-primary">Resumen electoral</h2>
                </div>

                <div className="grid grid-cols-1 divide-y divide-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <Users className="h-4 w-4" />
                            Quorum legal
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">65.4%</p>
                        <p className="mt-2 text-xs font-semibold text-success-fg">Alcanzado</p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
                            <div className="h-full bg-brand-500" style={{ width: "65.4%" }} />
                        </div>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <Activity className="h-4 w-4" />
                            Participacion activa
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">142</p>
                        <p className="mt-2 text-xs font-semibold cc-text-secondary">Votantes unicos este mes</p>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <ShieldCheck className="h-4 w-4" />
                            Validacion de poderes
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">12</p>
                        <p className="mt-2 text-xs font-semibold text-warning-fg">Pendientes de revision</p>
                    </div>
                </div>
            </section>

            <PollManager />
        </div>
    );
}
