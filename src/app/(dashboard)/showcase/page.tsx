"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/authContext";
import { isShowcaseUser } from "@/lib/showcase";
import {
    ArrowRight,
    Bell,
    BookOpen,
    Building2,
    CalendarCheck,
    CheckCircle2,
    ClipboardList,
    Compass,
    GraduationCap,
    MessageSquare,
    ShieldCheck,
    ShoppingBag,
    UserCog,
    Vote,
    Wrench,
} from "lucide-react";

const adminSteps = [
    {
        title: "Panel ejecutivo",
        description: "Muestra actividad real: residentes, avisos, cursos IA, pagos, solicitudes y graficos.",
        href: "/home",
        icon: Building2,
        proof: "El cliente ve una comunidad operando, no un tablero vacio.",
    },
    {
        title: "Comunicaciones",
        description: "Revisa avisos oficiales y explica como administracion centraliza mensajes.",
        href: "/comunicaciones",
        icon: Bell,
        proof: "Sirve para reemplazar cadenas de WhatsApp desordenadas.",
    },
    {
        title: "Votaciones",
        description: "Abre la votacion activa y luego el panel admin de gestion.",
        href: "/votaciones",
        icon: Vote,
        proof: "La votacion esta lista para app y WhatsApp cuando Twilio este configurado.",
    },
    {
        title: "Aula Virtual CoCo",
        description: "Entra a cursos IA de copropiedad, seguridad y operacion diaria.",
        href: "/resident/training",
        icon: GraduationCap,
        proof: "Convive no solo administra: tambien educa a la comunidad.",
    },
    {
        title: "Mantencion y casos CoCo",
        description: "Muestra filtracion, ruido recurrente, activos criticos y cola operativa.",
        href: "/admin/mantenimiento",
        icon: Wrench,
        proof: "La IA convierte mensajes en casos trazables.",
    },
    {
        title: "Marketplace y servicios",
        description: "Cierra mostrando comercio interno, proveedores y solicitudes.",
        href: "/marketplace",
        icon: ShoppingBag,
        proof: "La plataforma genera valor diario para residentes.",
    },
];

const roleCards = [
    {
        role: "Administracion",
        email: "admin.showcase@conviveconnect.com",
        route: "/home",
        icon: UserCog,
        bullets: ["vision global", "votaciones", "mantencion", "centro operativo"],
    },
    {
        role: "Residente",
        email: "residente.showcase@conviveconnect.com",
        route: "/resident/finances",
        icon: MessageSquare,
        bullets: ["gastos comunes", "reservas", "votaciones", "cursos IA"],
    },
    {
        role: "Conserjeria",
        email: "conserje.showcase@conviveconnect.com",
        route: "/concierge/packages",
        icon: ShieldCheck,
        bullets: ["paqueteria", "visitas", "novedades", "aula operativa"],
    },
];

const closeChecks = [
    "El cliente entiende que puede partir cargando nominas por Excel/PDF/CSV.",
    "El cliente ve que los datos estan separados por rol y comunidad.",
    "El cliente prueba al menos un flujo: votacion, reserva, gasto, caso CoCo o marketplace.",
    "El cliente sale con una proxima accion concreta: piloto, carga de datos o contrato.",
];

export default function ShowcasePage() {
    const { user } = useAuth();
    const isShowcase = isShowcaseUser(user);

    if (!isShowcase) {
        return (
            <div className="mx-auto max-w-3xl rounded-lg border border-subtle bg-surface p-8 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-elevated text-brand-600">
                    <Compass className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-semibold cc-text-primary">Recorrido no disponible</h1>
                <p className="mt-2 cc-text-secondary">
                    Esta guia solo aparece en el entorno comercial de Convive Showcase.
                </p>
                <Link href="/home" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
                    Volver al panel
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <header className="rounded-lg border border-subtle bg-surface p-6 shadow-sm lg:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                            <Compass className="h-4 w-4" />
                            Recorrido comercial
                        </div>
                        <h1 className="text-3xl font-semibold tracking-tight cc-text-primary lg:text-4xl">
                            Como mostrar Convive Connect en 12 minutos
                        </h1>
                        <p className="mt-3 max-w-2xl text-base cc-text-secondary">
                            Usa este orden para que el cliente entienda la plataforma como operacion real del edificio: primero control, luego participacion, despues IA y trazabilidad.
                        </p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-secondary">
                        Entorno: <span className="font-semibold cc-text-primary">Edificio Convive Showcase</span>
                    </div>
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                {roleCards.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link key={item.role} href={item.route} className="group rounded-lg border border-subtle bg-surface p-5 shadow-sm transition-colors hover:border-default">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <ArrowRight className="h-4 w-4 cc-text-tertiary transition-transform group-hover:translate-x-1" />
                            </div>
                            <h2 className="text-lg font-semibold cc-text-primary">{item.role}</h2>
                            <p className="mt-1 text-sm cc-text-secondary">{item.email}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {item.bullets.map((bullet) => (
                                    <span key={bullet} className="rounded-md bg-elevated px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] cc-text-secondary">
                                        {bullet}
                                    </span>
                                ))}
                            </div>
                        </Link>
                    );
                })}
            </section>

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="border-b border-subtle p-5">
                    <h2 className="text-xl font-semibold cc-text-primary">Guion recomendado</h2>
                    <p className="mt-1 text-sm cc-text-secondary">Abre cada punto en orden y cuenta la historia del edificio.</p>
                </div>
                <div className="grid gap-0 divide-y divide-subtle">
                    {adminSteps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <Link key={step.title} href={step.href} className="group grid gap-4 p-5 transition-colors hover:bg-elevated/50 md:grid-cols-[56px_1fr_280px_28px] md:items-center">
                                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-elevated cc-text-secondary">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Paso {index + 1}</div>
                                    <h3 className="text-base font-semibold cc-text-primary">{step.title}</h3>
                                    <p className="mt-1 text-sm cc-text-secondary">{step.description}</p>
                                </div>
                                <div className="rounded-lg border border-subtle bg-canvas px-3 py-2 text-sm cc-text-secondary">
                                    {step.proof}
                                </div>
                                <ArrowRight className="h-4 w-4 cc-text-tertiary transition-transform group-hover:translate-x-1" />
                            </Link>
                        );
                    })}
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div className="rounded-lg border border-subtle bg-surface p-6 shadow-sm">
                    <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <ClipboardList className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary">Flujos que conviene probar en vivo</h2>
                            <p className="text-sm cc-text-secondary">Si el cliente tiene tiempo, elige uno o dos.</p>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FlowLink href="/admin/onboarding" icon={<BookOpen className="h-4 w-4" />} title="Carga masiva" body="Subir nomina y revisar calidad antes de guardar." />
                        <FlowLink href="/amenities" icon={<CalendarCheck className="h-4 w-4" />} title="Reserva de espacio" body="Ver disponibilidad y registrar una reserva." />
                        <FlowLink href="/admin/votaciones" icon={<Vote className="h-4 w-4" />} title="Crear votacion" body="Publicar consulta y preparar envio por app/WhatsApp." />
                        <FlowLink href="/resident/cases" icon={<Wrench className="h-4 w-4" />} title="Caso CoCo" body="Mostrar seguimiento, estado y trazabilidad." />
                    </div>
                </div>

                <div className="rounded-lg border border-subtle bg-slate-950 p-6 text-white shadow-sm">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-semibold">Cierre del showcase</h2>
                    <div className="mt-4 space-y-3">
                        {closeChecks.map((check) => (
                            <div key={check} className="flex gap-3 text-sm text-slate-200">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                                <span>{check}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}

function FlowLink({
    href,
    icon,
    title,
    body,
}: {
    href: string;
    icon: ReactNode;
    title: string;
    body: string;
}) {
    return (
        <Link href={href} className="rounded-lg border border-subtle bg-canvas p-4 transition-colors hover:border-default">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-surface cc-text-secondary">
                {icon}
            </div>
            <h3 className="text-sm font-semibold cc-text-primary">{title}</h3>
            <p className="mt-1 text-sm cc-text-secondary">{body}</p>
        </Link>
    );
}
