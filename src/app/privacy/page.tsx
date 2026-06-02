import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: "Politica de privacidad",
    description: "Tratamiento de datos personales, cookies, WhatsApp, camaras y comunicaciones en Convive Connect.",
    alternates: { canonical: "/privacy" },
};

const sections = [
    {
        title: "1. Datos que tratamos",
        body: "Recolectamos los datos necesarios para operar la comunidad: nombre, correo, rol, unidad, telefono, preferencias de notificacion, registros de acceso, pagos, reservas, votaciones, solicitudes, conversaciones con CoCo y evidencias que el usuario decida adjuntar.",
    },
    {
        title: "2. Finalidad y minimizacion",
        body: "Usamos la informacion solo para administrar la comunidad, habilitar comunicaciones, seguridad, pagos, soporte, auditoria operacional y cumplimiento de obligaciones asociadas a la copropiedad. Evitamos solicitar o mostrar datos que no sean necesarios para la finalidad declarada.",
    },
    {
        title: "3. Acceso por rol",
        body: "El acceso a datos se controla segun perfil: residente, conserjeria, administracion y superadmin. Un vecino no debe acceder a datos privados de otro vecino salvo que exista una finalidad comunitaria legitima y autorizada.",
    },
    {
        title: "4. WhatsApp y comunicaciones",
        body: "WhatsApp es opt-in. El residente puede activar o desactivar el canal desde su perfil. Los mensajes se usan para avisos operativos, CoCo IA y notificaciones de comunidad. No se debe usar este canal para exponer deudas, RUT u otra informacion sensible a terceros.",
    },
    {
        title: "5. Cookies",
        body: "Utilizamos cookies tecnicas para sesion, seguridad y preferencias. Podemos usar medicion agregada para mejorar conversion y experiencia, sin vender datos personales.",
    },
    {
        title: "6. Seguridad",
        body: "Aplicamos cifrado en transito, politicas de acceso, rate limiting, separacion multi-tenant y registros de auditoria para operaciones sensibles. Ninguna plataforma elimina todo riesgo, pero reducimos exposicion y revisamos controles de forma continua.",
    },
    {
        title: "7. Derechos de los titulares",
        body: "Los usuarios pueden solicitar acceso, rectificacion, actualizacion o eliminacion de datos cuando corresponda. Las solicitudes se canalizan por la administracion de la comunidad o por soporte de Convive Connect.",
    },
    {
        title: "8. Marco chileno",
        body: "Convive se diseña considerando la Ley 21.442 de Copropiedad Inmobiliaria y principios de proteccion de datos como finalidad, proporcionalidad, seguridad, transparencia y confidencialidad.",
    },
];

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-slate-50 p-8 pt-12 cc-text-primary dark:bg-[#0B0F19] md:p-16">
            <div className="mx-auto max-w-4xl">
                <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold text-role-admin-fg transition-opacity hover:opacity-80">
                    <ArrowLeft className="h-5 w-5" /> Regresar
                </Link>
                <h1 className="mb-4 text-4xl font-extrabold">Politica de privacidad</h1>
                <p className="mb-8 text-lg leading-relaxed cc-text-secondary">
                    Ultima actualizacion: junio de 2026. En Convive Connect protegemos los datos personales de residentes,
                    administradores, conserjes y proveedores de cada comunidad.
                </p>

                <div className="space-y-8 rounded-3xl border border-subtle bg-surface p-8">
                    {sections.map(section => (
                        <section key={section.title}>
                            <h2 className="mb-3 text-xl font-bold">{section.title}</h2>
                            <p className="leading-7 cc-text-secondary">{section.body}</p>
                        </section>
                    ))}
                    <section className="rounded-2xl border border-subtle bg-elevated/40 p-5">
                        <h2 className="mb-2 text-lg font-bold">Contacto de privacidad</h2>
                        <p className="text-sm leading-6 cc-text-secondary">
                            Para solicitudes de datos o incidentes de privacidad, escribe a
                            {" "}<a href="mailto:soporte@conviveconnect.com" className="font-semibold text-brand-600 underline">soporte@conviveconnect.com</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
