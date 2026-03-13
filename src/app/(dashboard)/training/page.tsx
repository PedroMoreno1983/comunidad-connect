"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { motion, AnimatePresence } from "framer-motion";
import {
    GraduationCap, ChevronDown, CheckCircle2,
    Key, Megaphone, DollarSign, Wrench,
    Vote, BarChart3, Home, Shield, Package,
    Bell, Eye, BookOpen, PlayCircle, ExternalLink, Award
} from "lucide-react";

interface Step {
    text: string;
    tip?: string;
}

interface Guide {
    id: string;
    icon: React.ElementType;
    title: string;
    duration: string;
    color: string;
    bg: string;
    steps: Step[];
}

interface ExternalCourse {
    id: string;
    title: string;
    provider: string;
    duration: string;
    link: string;
    color: string;
    bg: string;
    roles: string[];
}

const ADMIN_GUIDES: Guide[] = [
    {
        id: "units",
        icon: Home,
        title: "Gestionar Unidades (Departamentos)",
        duration: "5 min",
        color: "text-indigo-600 dark:text-indigo-400",
        bg: "bg-indigo-100 dark:bg-indigo-500/20",
        steps: [
            { text: "Ve al menú lateral → **Unidades**." },
            { text: "Haz clic en **\"Nueva Unidad\"** para agregar un departamento." },
            { text: "Ingresa el número de unidad, torre (si aplica) y el residente asignado." },
            { text: "Guarda. El residente podrá ver su unidad en su perfil automáticamente.", tip: "Puedes editar o eliminar unidades en cualquier momento desde la tabla." },
        ],
    },
    {
        id: "invite",
        icon: Key,
        title: "Invitar Residentes y Conserjes",
        duration: "3 min",
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-100 dark:bg-emerald-500/20",
        steps: [
            { text: "Ve al menú lateral → **Usuarios**." },
            { text: "Al tope de la página verás el panel **\"Códigos de Invitación\"** con 2 códigos únicos." },
            { text: "El **código verde** es para residentes. El **código naranja** es para conserjes." },
            { text: "Comparte el código por WhatsApp, papel o email." },
            { text: "El nuevo miembro va a **comunidadconnect.cl/signup**, ingresa el código y su cuenta queda asignada automáticamente a tu comunidad y rol correcto.", tip: "Los códigos son permanentes y únicos por comunidad. No los compartas públicamente." },
        ],
    },
    {
        id: "announcements",
        icon: Megaphone,
        title: "Publicar Avisos Oficiales",
        duration: "2 min",
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-100 dark:bg-amber-500/20",
        steps: [
            { text: "Ve al menú lateral → **Avisos Oficiales**." },
            { text: "Haz clic en **\"Nuevo Aviso\"**." },
            { text: "Elige el tipo: Información, Evento o Alerta urgente." },
            { text: "Escribe el título y el contenido del aviso." },
            { text: "Publica. Todos los residentes y conserjes lo verán en su dashboard inmediatamente.", tip: "Los avisos de tipo Alerta aparecen con fondo rojo para mayor visibilidad." },
        ],
    },
    {
        id: "expenses",
        icon: DollarSign,
        title: "Gestionar Gastos Comunes",
        duration: "5 min",
        color: "text-rose-600 dark:text-rose-400",
        bg: "bg-rose-100 dark:bg-rose-500/20",
        steps: [
            { text: "Ve al menú lateral → **Finanzas Comunitarias**." },
            { text: "Puedes ver el estado de pagos de cada residente." },
            { text: "Para cargar nuevos gastos, usa el botón **\"Nuevo Gasto\"** e ingresa el monto y concepto." },
            { text: "Los residentes recibirán una notificación y podrán pagar en línea.", tip: "Usa el filtro por estado para ver quién tiene pagos pendientes." },
        ],
    },
    {
        id: "maintenance",
        icon: Wrench,
        title: "Aprobar Solicitudes de Servicio",
        duration: "3 min",
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-100 dark:bg-purple-500/20",
        steps: [
            { text: "Ve al menú lateral → **Mantenimiento**." },
            { text: "Verás todas las solicitudes de los residentes ordenadas por fecha." },
            { text: "Haz clic en una solicitud para ver los detalles y fotos adjuntas." },
            { text: "Cambia el estado a **\"En Proceso\"** o **\"Resuelto\"** según corresponda.", tip: "El residente recibe una notificación automática con cada cambio de estado." },
        ],
    },
    {
        id: "votaciones",
        icon: Vote,
        title: "Crear Votaciones Comunitarias",
        duration: "4 min",
        color: "text-teal-600 dark:text-teal-400",
        bg: "bg-teal-100 dark:bg-teal-500/20",
        steps: [
            { text: "Ve al menú lateral → **Gestión Votos**." },
            { text: "Haz clic en **\"Nueva Votación\"**." },
            { text: "Escribe la pregunta y las opciones de respuesta (mínimo 2)." },
            { text: "Define la fecha de cierre de la votación." },
            { text: "Publica. Los residentes podrán votar con un clic y los resultados se actualizan en tiempo real.", tip: "Las votaciones son anónimas para los residentes, pero tú puedes ver los resultados agregados." },
        ],
    },
    {
        id: "analytics",
        icon: BarChart3,
        title: "Leer el Dashboard de Analítica",
        duration: "3 min",
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-500/20",
        steps: [
            { text: "En la página **Inicio** verás 4 tarjetas con métricas clave: Residentes, Avisos, Solicitudes y Pagos pendientes." },
            { text: "Más abajo está el gráfico de **Gastos Mensuales** de los últimos 6 meses." },
            { text: "El gráfico de **Distribución por Categoría** muestra en qué se gasta más." },
            { text: "El panel de **Amenidades** muestra qué espacios se usan más.", tip: "Todos los datos son en tiempo real desde tu base de datos." },
        ],
    },
];

const CONCIERGE_GUIDES: Guide[] = [
    {
        id: "visitors",
        icon: Shield,
        title: "Registrar una Visita",
        duration: "2 min",
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-100 dark:bg-amber-500/20",
        steps: [
            { text: "Ve al menú lateral → **Visitas**." },
            { text: "Haz clic en **\"Registrar Visita\"**." },
            { text: "Ingresa el nombre del visitante y la unidad que viene a ver." },
            { text: "Si el residente ha pre-autorizado la visita, la verás en la lista como **\"Esperada\"** con fondo verde." },
            { text: "Confirma el ingreso marcando la visita como **\"Ingresó\"**.", tip: "Puedes filtrar el historial por fecha para buscar cualquier visita pasada." },
        ],
    },
    {
        id: "packages",
        icon: Package,
        title: "Gestionar Paquetes y Encomiendas",
        duration: "2 min",
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-500/20",
        steps: [
            { text: "Ve al menú lateral → **Paquetería**." },
            { text: "Cuando llegue una encomienda, haz clic en **\"Registrar Paquete\"**." },
            { text: "Selecciona la unidad destinataria y agrega una descripción del paquete." },
            { text: "El residente recibe una notificación automática en su app.", tip: "Al momento de entregarlo, márcalo como 'Entregado' para mantener el registro limpio." },
        ],
    },
    {
        id: "access",
        icon: Eye,
        title: "Ver el Historial de Accesos",
        duration: "2 min",
        color: "text-indigo-600 dark:text-indigo-400",
        bg: "bg-indigo-100 dark:bg-indigo-500/20",
        steps: [
            { text: "Ve al menú lateral → **Visitas**." },
            { text: "El historial completo aparece en la tabla, ordenado por fecha y hora." },
            { text: "Usa los filtros de fecha para buscar visitas en un rango específico." },
            { text: "Puedes ver quién autorizó cada visita y a qué unidad fue.", tip: "Este historial puede ser útil en caso de incidentes de seguridad." },
        ],
    },
    {
        id: "announcements-read",
        icon: Bell,
        title: "Entender los Avisos Oficiales",
        duration: "1 min",
        color: "text-rose-600 dark:text-rose-400",
        bg: "bg-rose-100 dark:bg-rose-500/20",
        steps: [
            { text: "Ve al menú lateral → **Avisos Oficiales**." },
            { text: "Los avisos con fondo rojo son **Alertas urgentes** — léelos primero." },
            { text: "Los de fondo morado son **Eventos** (reuniones, mantenciones programadas, etc.)." },
            { text: "Los de fondo azul son **Informaciones** generales del edificio.", tip: "El número rojo en el ícono de campana del sidebar indica cuántos avisos no has leído." },
        ],
    },
];

const EXTERNAL_COURSES: ExternalCourse[] = [
    {
        id: "course-1",
        title: "Administración de Edificios y Condominios",
        provider: "Inacap",
        duration: "120 horas",
        link: "https://www.inacap.cl",
        color: "text-red-600 dark:text-red-400",
        bg: "bg-red-100 dark:bg-red-500/20",
        roles: ["admin", "concierge"],
    },
    {
        id: "course-2",
        title: "Diplomado en Gestión Inmobiliaria",
        provider: "Universidad Católica de Chile (UC)",
        duration: "6 meses",
        link: "https://www.uc.cl",
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-100 dark:bg-blue-500/20",
        roles: ["admin"],
    },
    {
        id: "course-3",
        title: "Manejo de Conflictos y Resolución",
        provider: "Duoc UC",
        duration: "40 horas",
        link: "https://www.duoc.cl",
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-100 dark:bg-amber-500/20",
        roles: ["admin", "concierge"],
    },
    {
        id: "course-4",
        title: "Técnico en Administración de Propiedades",
        provider: "AIEP",
        duration: "2 semestres",
        link: "https://www.aiep.cl",
        color: "text-green-600 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-500/20",
        roles: ["admin", "concierge"],
    },
    {
        id: "course-5",
        title: "Seguridad Privada y Control de Accesos",
        provider: "CFT San Agustín",
        duration: "60 horas",
        link: "https://www.cftsa.cl",
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-100 dark:bg-purple-500/20",
        roles: ["concierge"],
    },
    {
        id: "course-6",
        title: "Gestión de Comunidades Residenciales",
        provider: "Cámara Chilena de la Construcción (CChC)",
        duration: "3 meses",
        link: "https://www.cchc.cl",
        color: "text-orange-600 dark:text-orange-400",
        bg: "bg-orange-100 dark:bg-orange-500/20",
        roles: ["admin"],
    },
    {
        id: "course-7",
        title: "Liderazgo y Comunicación Organizacional",
        provider: "Universidad Diego Portales (UDP)",
        duration: "45 horas",
        link: "https://www.udp.cl",
        color: "text-teal-600 dark:text-teal-400",
        bg: "bg-teal-100 dark:bg-teal-500/20",
        roles: ["admin", "concierge"],
    },
];

function GuideCard({ guide, index }: { guide: Guide; index: number }) {
    const [open, setOpen] = useState(false);
    const [completed, setCompleted] = useState<Set<number>>(new Set());
    const Icon = guide.icon;

    const toggleStep = (i: number) => {
        setCompleted(prev => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    };

    const progress = (completed.size / guide.steps.length) * 100;
    const done = completed.size === guide.steps.length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${done
                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                }`}
        >
            {/* Header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
                <div className={`p-3 rounded-xl flex-shrink-0 ${guide.bg}`}>
                    <Icon className={`h-5 w-5 ${guide.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 dark:text-white">{guide.title}</p>
                        {done && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Completado
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">⏱ {guide.duration}</span>
                        {completed.size > 0 && !done && (
                            <span className="text-xs text-slate-400">{completed.size}/{guide.steps.length} pasos</span>
                        )}
                    </div>
                    {/* Progress bar */}
                    {completed.size > 0 && (
                        <div className="mt-2 h-1 rounded-full bg-slate-200 dark:bg-slate-700 w-32">
                            <div
                                className="h-1 rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}
                </div>
                <ChevronDown className={`h-5 w-5 text-slate-400 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
            </button>

            {/* Steps */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 pt-2 space-y-3 border-t border-slate-100 dark:border-slate-700">
                            {guide.steps.map((step, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <button
                                        onClick={() => toggleStep(i)}
                                        className={`mt-0.5 flex-shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${completed.has(i)
                                            ? "bg-emerald-500 border-emerald-500"
                                            : "border-slate-300 dark:border-slate-600 hover:border-emerald-400"
                                            }`}
                                    >
                                        {completed.has(i) && <CheckCircle2 className="h-3.5 w-3.5 text-white fill-white" />}
                                    </button>
                                    <div>
                                        <p
                                            className={`text-sm leading-relaxed transition-colors ${completed.has(i) ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-700 dark:text-slate-300"
                                                }`}
                                            dangerouslySetInnerHTML={{
                                                __html: step.text.replace(/\*\*(.*?)\*\*/g, "<strong class='font-semibold text-slate-900 dark:text-white'>$1</strong>")
                                            }}
                                        />
                                        {step.tip && (
                                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-100 dark:border-amber-900/30">
                                                💡 {step.tip}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export default function TrainingPage() {
    const { user } = useAuth();

    if (!user) return null;

    const isAdmin = user.role === "admin";
    const isConcierge = user.role === "concierge";

    if (!isAdmin && !isConcierge) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-slate-500">No tienes acceso a esta sección.</p>
            </div>
        );
    }

    const guides = isAdmin ? ADMIN_GUIDES : CONCIERGE_GUIDES;
    const roleLabel = isAdmin ? "Administrador" : "Conserje";
    const roleGradient = isAdmin ? "from-indigo-500 to-purple-600" : "from-amber-500 to-orange-600";
    const totalTime = guides.reduce((acc, g) => acc + parseInt(g.duration), 0);
    const filteredCourses = EXTERNAL_COURSES.filter(c => c.roles.includes(user.role));

    return (
        <div className="max-w-3xl space-y-8">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900">
                    {/* Decorative blobs */}
                    <div className={`absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br ${roleGradient} opacity-20 blur-2xl`} />
                    <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 opacity-10 blur-2xl" />

                    <div className="relative flex items-start gap-5">
                        <div className={`p-4 rounded-2xl bg-gradient-to-br ${roleGradient} shadow-2xl flex-shrink-0`}>
                            <GraduationCap className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r ${roleGradient} text-white`}>
                                    {roleLabel}
                                </span>
                                <span className="text-xs text-slate-400">⏱ ~{totalTime} min en total</span>
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-1">Centro de Capacitación</h1>
                            <p className="text-slate-400 text-sm">
                                Domina cada función de ComunidadConnect paso a paso. Marca cada paso como completado para llevar tu progreso.
                            </p>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="relative mt-6 flex items-center gap-6 pt-6 border-t border-white/10">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-300"><strong className="text-white">{guides.length}</strong> guías</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <PlayCircle className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-300">Aprende a tu ritmo</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Guides */}
            <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                    Guías disponibles para {roleLabel}
                </h2>
                <div className="space-y-3">
                    {guides.map((guide, idx) => (
                        <GuideCard key={guide.id} guide={guide} index={idx} />
                    ))}
                </div>
            </div>

            {/* Institutional Courses — visible for admin and concierge */}
            {filteredCourses.length > 0 && (
                <div className="pt-8 mt-8 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/50">
                            <GraduationCap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                Especialización Externa
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Cursos impartidos por universidades, institutos profesionales y centros de formación técnica.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredCourses.map((course) => (
                            <a
                                key={course.id}
                                href={course.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500 transition-all shadow-sm hover:shadow-md flex flex-col h-full"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`p-2.5 rounded-xl ${course.bg}`}>
                                        <Award className={`h-5 w-5 ${course.color}`} />
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                </div>

                                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5 line-clamp-2">
                                    {course.title}
                                </h3>

                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-3">
                                    {course.provider}
                                </p>

                                <div className="mt-auto pt-4 border-t border-slate-50 dark:border-slate-700/50">
                                    <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                                        Duración: {course.duration}
                                    </span>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
