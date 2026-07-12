"use client";

import Link from "next/link";
import { PollManager } from "@/components/admin/PollManager";
import { ModuleFlow } from "@/components/ui/ModuleFlow";
import { Activity, Calendar, ShieldCheck, Users } from "lucide-react";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

export default function AdminVotacionesPage() {
    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
            <header className="flex flex-col justify-between gap-5 border-b pb-6 md:flex-row md:items-end" style={{ borderColor: "var(--cc-line)" }}>
                <div>
                    <Eyebrow>Participación comunitaria</Eyebrow>
                    <DisplayHeading size={32} className="mt-2">Gestión de votaciones</DisplayHeading>
                    <p className="mt-2 max-w-3xl text-sm leading-6 font-medium cc-text-secondary">
                        Crea consultas formales, publicalas en el chat general y distribuyelas por notificaciones o WhatsApp a residentes habilitados.
                    </p>
                </div>

                <Link
                    href="#votaciones-publicadas"
                    className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold cc-text-primary transition-colors hover:bg-[var(--cc-paper-warm)]"
                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                >
                    <Calendar className="h-4 w-4 cc-text-secondary" />
                    Historial legal
                </Link>
            </header>

            <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-center gap-3 border-b p-5" style={{ borderColor: "var(--cc-line)" }}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                        <ShieldCheck className="h-4 w-4" />
                    </span>
                    <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)", fontSize: 19 }}>Resumen electoral</h2>
                </div>

                <div className="grid grid-cols-1 divide-y divide-[var(--cc-line)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--cc-line)] sm:divide-y-0">
                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <Users className="h-4 w-4" />
                            Quorum legal
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>65.4%</p>
                        <p className="mt-2 text-xs font-semibold text-success-fg">Alcanzado</p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--cc-paper-warm)" }}>
                            <div className="h-full rounded-full" style={{ width: "65.4%", background: "var(--cc-copper)" }} />
                        </div>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <Activity className="h-4 w-4" />
                            Participacion activa
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>142</p>
                        <p className="mt-2 text-xs font-semibold cc-text-secondary">Votantes unicos este mes</p>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <ShieldCheck className="h-4 w-4" />
                            Validacion de poderes
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>12</p>
                        <p className="mt-2 text-xs font-semibold text-warning-fg">Pendientes de revisión</p>
                    </div>
                </div>
            </section>

            <ModuleFlow
                title="De consulta a decision trazable"
                description="El modulo debe terminar con residentes notificados, votos disponibles y un resultado consultable por administracion."
                statusLabel="listo para publicar"
                completedSteps={0}
                currentStep={1}
                primaryActionLabel="Crear votacion"
                primaryActionHref="#crear-votacion"
                secondaryActionLabel="Ver publicadas"
                secondaryActionHref="#votaciones-publicadas"
                steps={[
                    "Redactar consulta y opciones",
                    "Elegir canales: app, notificacion y WhatsApp",
                    "Publicar para residentes",
                    "Revisar participacion y cierre",
                ]}
                outcome="Cierre esperado: la votacion aparece en el centro de votacion, queda anunciada en canales elegidos y el admin puede revisar resultados agregados."
            />

            <PollManager />
        </div>
    );
}
