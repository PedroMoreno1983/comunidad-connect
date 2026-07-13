import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, Building2, CheckCircle2, KeyRound, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { CommercialLeadForm } from "@/components/commercial/CommercialLeadForm";

export const metadata: Metadata = {
    title: "Recorrido comercial | Convive Connect",
    description: "Recorrido por los flujos reales de administracion, residentes, conserjeria y CoCo en Convive Connect.",
};

const roleJourney = [
    {
        number: "01",
        title: "Administración",
        description: "Controla la comunidad desde información real y separada por edificio.",
        icon: Building2,
        items: ["Residentes, unidades y permisos", "Gastos comunes y reportes", "Votaciones, anuncios y solicitudes", "Auditoría de acciones de CoCo"],
    },
    {
        number: "02",
        title: "Residentes",
        description: "Cada persona ve solamente lo que corresponde a su comunidad y unidad.",
        icon: Users,
        items: ["Gastos y estado de cuenta", "Reservas de espacios comunes", "Marketplace con mensajería privada", "Cursos, avisos y participación vecinal"],
    },
    {
        number: "03",
        title: "Conserjería",
        description: "La operación diaria queda centralizada y con responsables claros.",
        icon: KeyRound,
        items: ["Visitas y accesos", "Encomiendas y novedades", "Solicitudes operativas", "Información limitada por rol"],
    },
    {
        number: "04",
        title: "CoCo",
        description: "El agente consulta datos y ejecuta únicamente acciones habilitadas.",
        icon: Bot,
        items: ["Respuestas con contexto de la comunidad", "Confirmación antes de escribir datos", "Permisos y trazabilidad", "Escalamiento cuando falta autorización"],
    },
];

const activationSteps = [
    "Creación del tenant y la cuenta administradora",
    "Carga de unidades, residentes y documentos disponibles",
    "Revisión de brechas antes de guardar información",
    "Activación de roles, módulos e invitaciones aprobadas",
];

export default function CommercialTourPage() {
    return (
        <main className="min-h-screen" style={{ background: "var(--cc-paper-warm)", color: "var(--cc-ink)" }}>
            <header className="border-b" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 md:px-12">
                    <Link href="/" className="inline-flex items-center gap-3" aria-label="Volver al inicio">
                        <ArrowLeft className="h-4 w-4" />
                        <Brand withMark size={18} />
                    </Link>
                    <Link href="/onboarding" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                        Activar con CoCo <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </header>

            <section className="border-b px-4 py-20 sm:px-6 md:px-12 md:py-28" style={{ borderColor: "var(--cc-line)", background: "var(--cc-carbon)" }}>
                <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--cc-copper-soft)" }}>Recorrido comercial verificable</p>
                        <h1 className="mt-5 max-w-4xl text-4xl font-normal leading-[1.02] tracking-tight text-white sm:text-6xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                            Así opera una comunidad real con Convive Connect.
                        </h1>
                        <p className="mt-6 max-w-2xl text-base leading-8" style={{ color: "rgba(255,255,255,0.68)" }}>
                            Revisa qué ve cada rol, cómo se activan los datos y dónde interviene CoCo. Este recorrido describe flujos operativos; no presenta botones simulados ni resultados inventados.
                        </p>
                    </div>
                    <div className="rounded-2xl border p-6" style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)" }}>
                        <ShieldCheck className="h-6 w-6" style={{ color: "var(--cc-sage-soft)" }} />
                        <p className="mt-4 text-sm font-semibold text-white">Qué puedes validar</p>
                        <p className="mt-2 text-sm leading-6" style={{ color: "rgba(255,255,255,0.62)" }}>
                            Alcance por rol, activación, trazabilidad, mensajería vecinal y continuidad comercial.
                        </p>
                    </div>
                </div>
            </section>

            <section className="px-4 py-16 sm:px-6 md:px-12 md:py-24">
                <div className="mx-auto w-full max-w-7xl">
                    <div className="max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cc-copper)" }}>Recorrido por rol</p>
                        <h2 className="mt-3 text-3xl font-normal tracking-tight sm:text-4xl" style={{ fontFamily: "var(--cc-font-display)" }}>Una plataforma, cuatro experiencias conectadas.</h2>
                    </div>
                    <div className="mt-10 grid gap-5 md:grid-cols-2">
                        {roleJourney.map((role) => {
                            const Icon = role.icon;
                            return (
                                <article key={role.number} className="rounded-3xl border p-7" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <span className="text-xs" style={{ fontFamily: "var(--cc-font-mono)", color: "var(--cc-copper)" }}>{role.number}</span>
                                    </div>
                                    <h3 className="mt-6 text-2xl font-semibold">{role.title}</h3>
                                    <p className="mt-2 text-sm leading-6" style={{ color: "var(--cc-ink-muted)" }}>{role.description}</p>
                                    <ul className="mt-6 space-y-3">
                                        {role.items.map((item) => (
                                            <li key={item} className="flex items-start gap-3 text-sm">
                                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="border-y px-4 py-16 sm:px-6 md:px-12 md:py-24" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cc-copper)" }}>Activación operativa</p>
                        <h2 className="mt-3 text-3xl font-normal tracking-tight sm:text-4xl" style={{ fontFamily: "var(--cc-font-display)" }}>De archivos dispersos a una comunidad lista para operar.</h2>
                        <p className="mt-5 max-w-xl text-sm leading-7" style={{ color: "var(--cc-ink-muted)" }}>
                            La administración controla cada paso. CoCo propone estructuras y brechas, pero los datos no se activan sin revisión humana.
                        </p>
                        <Link href="/admin-onboarding" className="mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                            Comenzar activación real <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <ol className="space-y-4">
                        {activationSteps.map((step, index) => (
                            <li key={step} className="flex gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: "var(--cc-copper)" }}>{index + 1}</span>
                                <span className="pt-1 text-sm font-semibold leading-6">{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="px-4 py-16 sm:px-6 md:px-12 md:py-24">
                <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                    <div className="lg:sticky lg:top-8">
                        <MessageSquare className="h-6 w-6" style={{ color: "var(--cc-copper)" }} />
                        <h2 className="mt-5 text-3xl font-normal tracking-tight sm:text-4xl" style={{ fontFamily: "var(--cc-font-display)" }}>¿Quieres revisarlo con tus propios datos?</h2>
                        <p className="mt-4 text-sm leading-7" style={{ color: "var(--cc-ink-muted)" }}>
                            Cuéntanos el tamaño de la comunidad y la prioridad. La solicitud queda almacenada, el correo se confirma y el equipo comercial recibe trazabilidad.
                        </p>
                    </div>
                    <CommercialLeadForm source="commercial_tour" />
                </div>
            </section>
        </main>
    );
}
