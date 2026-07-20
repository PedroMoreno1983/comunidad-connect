import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
    PRIVACY_CONTACT_EMAIL,
    PRIVACY_POLICY_VERSION,
    PRIVACY_RESPONSIBLE_ADDRESS,
    PRIVACY_RESPONSIBLE_NAME,
} from '@/lib/privacy';

export const metadata = {
    title: 'Política de privacidad',
    description: 'Tratamiento de datos personales, IA, transferencias internacionales y derechos en Convive Connect.',
    alternates: { canonical: '/privacy' },
};

const sections = [
    {
        title: '1. Quién es responsable y quién trata los datos',
        body: `La administración o comunidad que contrata Convive Connect determina las finalidades de la gestión residencial y actúa normalmente como responsable. ${PRIVACY_RESPONSIBLE_NAME}, con domicilio informado en ${PRIVACY_RESPONSIBLE_ADDRESS}, presta la plataforma y actúa como encargado tecnológico, salvo en finalidades propias como seguridad, soporte, facturación y cumplimiento legal.`,
    },
    {
        title: '2. Datos tratados',
        body: 'Tratamos identificación y contacto; rol, comunidad y unidad; accesos, visitas y encomiendas; pagos y gastos comunes; reservas y votaciones; solicitudes, casos y comunicaciones; marketplace; registros técnicos y de seguridad; eventos IoT; conversaciones con CoCo y memorias de IA. El fondo solidario puede contener información sensible de salud o vulnerabilidad, que requiere una base específica y controles reforzados.',
    },
    {
        title: '3. Finalidades y bases de licitud',
        body: 'Usamos los datos para ejecutar el servicio contratado, cumplir obligaciones legales, gestionar la comunidad, prevenir fraude, proteger la plataforma y atender solicitudes. Cuando corresponda, usamos consentimiento explícito —por ejemplo para WhatsApp y tratamientos sensibles— o interés legítimo debidamente evaluado. No condicionamos el acceso básico a consentimientos opcionales.',
    },
    {
        title: '4. Inteligencia artificial y decisiones humanas',
        body: 'Los mensajes enviados a CoCo pueden procesarse mediante proveedores externos de inteligencia artificial y generar memorias para dar continuidad. CoCo puede clasificar, resumir, recomendar o preparar acciones. Las decisiones con efectos relevantes deben permitir confirmación o intervención humana. Puedes oponerte a tratamientos basados en interés legítimo y solicitar revisión de una decisión automatizada.',
    },
    {
        title: '5. Proveedores y transferencias internacionales',
        body: 'Según los módulos habilitados, usamos Supabase (base de datos y autenticación), Vercel (hosting), Anthropic, OpenAI, Google Gemini y Voyage AI (IA y búsqueda), Resend (correo), Twilio (WhatsApp), Haulmer/Tuu (pagos) y Google Analytics (medición). Algunos proveedores pueden tratar datos fuera de Chile, incluido Estados Unidos. Exigimos contratos y medidas adecuadas al servicio y minimizamos lo enviado a cada proveedor.',
    },
    {
        title: '6. WhatsApp y comunicaciones',
        body: 'WhatsApp está desactivado por defecto. Solo se habilita mediante una acción afirmativa del titular y puede desactivarse en cualquier momento desde el Centro de privacidad. Tener un teléfono registrado no constituye consentimiento. Los mensajes no deben exponer deudas, RUT ni datos sensibles a terceros.',
    },
    {
        title: '7. Conservación y eliminación',
        body: 'Conservamos los datos mientras la cuenta o el contrato estén activos y durante los plazos necesarios para seguridad, defensa de derechos y obligaciones legales. Los registros financieros se conservan por el plazo legal aplicable. Las conversaciones, memorias IA, accesos, visitas, eventos IoT y logs operativos están sujetos a políticas de retención y eliminación periódica. Cuando no corresponda eliminar, aplicamos bloqueo o anonimización.',
    },
    {
        title: '8. Derechos de las personas',
        body: 'Puedes solicitar acceso, rectificación, supresión, oposición, bloqueo y portabilidad. También puedes retirar un consentimiento sin afectar el tratamiento anterior. El Centro de privacidad permite descargar datos y registrar solicitudes con seguimiento. Podemos pedir verificación de identidad y explicar cualquier rechazo o conservación obligatoria.',
    },
    {
        title: '9. Seguridad e incidentes',
        body: 'Aplicamos separación por comunidad, control por roles, cifrado en tránsito, límites de uso, auditoría y revisión de operaciones sensibles. Investigamos los incidentes, preservamos evidencia y notificamos a responsables, autoridades o titulares cuando la ley lo exija.',
    },
    {
        title: '10. Marco legal y cambios',
        body: 'Esta política considera la Ley 19.628 y sus modificaciones introducidas por la Ley 21.719, además de la Ley 21.442 de Copropiedad Inmobiliaria cuando corresponda. Publicaremos una nueva versión cuando cambien finalidades, proveedores o condiciones relevantes y solicitaremos una nueva aceptación cuando sea necesaria.',
    },
];

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-slate-50 p-5 pt-10 text-slate-950 dark:bg-[#0B0F19] dark:text-white sm:p-8 md:p-16">
            <div className="mx-auto max-w-4xl">
                <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 font-semibold text-emerald-700 transition-opacity hover:opacity-80">
                    <ArrowLeft className="h-5 w-5" /> Regresar
                </Link>
                <h1 className="mb-4 text-4xl font-extrabold">Política de privacidad</h1>
                <p className="mb-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                    Versión {PRIVACY_POLICY_VERSION}. Esta política explica de forma clara qué datos trata Convive Connect,
                    para qué los usa, con quién los comparte y cómo ejercer tus derechos.
                </p>
                <p className="mb-8 text-sm text-slate-600 dark:text-slate-300">
                    Responsable/encargado tecnológico: <strong>{PRIVACY_RESPONSIBLE_NAME}</strong> · {PRIVACY_RESPONSIBLE_ADDRESS} ·{' '}
                    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-semibold text-emerald-700 underline">{PRIVACY_CONTACT_EMAIL}</a>
                </p>

                <div className="space-y-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-8">
                    {sections.map(section => (
                        <section key={section.title}>
                            <h2 className="mb-3 text-xl font-bold">{section.title}</h2>
                            <p className="leading-7 text-slate-600 dark:text-slate-300">{section.body}</p>
                        </section>
                    ))}
                    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <h2 className="mb-2 text-lg font-bold">Ejercer tus derechos</h2>
                        <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                            Si tienes una cuenta, usa el <Link href="/privacy-center" className="font-semibold text-emerald-700 underline">Centro de privacidad</Link>.
                            También puedes escribir a <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-semibold text-emerald-700 underline">{PRIVACY_CONTACT_EMAIL}</a>.
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
