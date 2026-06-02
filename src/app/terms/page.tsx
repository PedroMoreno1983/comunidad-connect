import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: "Terminos del servicio",
    description: "Condiciones de uso de Convive Connect para comunidades, administraciones, residentes y conserjeria.",
    alternates: { canonical: "/terms" },
};

const terms = [
    {
        title: "1. Uso autorizado",
        body: "Convive Connect es una plataforma para comunidades residenciales, administraciones, residentes, conserjeria y proveedores autorizados. Cada usuario debe usar su propia cuenta y mantener credenciales bajo resguardo.",
    },
    {
        title: "2. Rol de la plataforma",
        body: "Convive facilita gestion, comunicacion, pagos, reservas, votaciones, soporte operacional y convivencia vecinal. La administracion de cada comunidad mantiene responsabilidad sobre decisiones, reglamentos, cobros, contratos y cumplimiento local.",
    },
    {
        title: "3. CoCo IA",
        body: "CoCo entrega asistencia operacional y orientacion general. No reemplaza asesoria legal, contable, medica ni decisiones formales de la administracion o del comite de administracion.",
    },
    {
        title: "4. Pagos y proveedores",
        body: "Los pagos se procesan mediante proveedores externos autorizados. Convive no almacena datos completos de tarjetas. Los servicios contratados a terceros o vecinos se rigen por las condiciones acordadas entre las partes.",
    },
    {
        title: "5. Convivencia y mediacion",
        body: "Los flujos de mediacion, banco de tiempo, abasto y plaza social buscan prevenir escaladas y fortalecer la colaboracion. No impiden que la administracion aplique el reglamento cuando corresponda.",
    },
    {
        title: "6. Seguridad y uso indebido",
        body: "No se permite usar la plataforma para hostigar, discriminar, exponer datos personales, difundir informacion falsa, suplantar identidad o acceder a informacion fuera del rol asignado.",
    },
    {
        title: "7. Cambios del servicio",
        body: "Podemos actualizar modulos, politicas, integraciones y condiciones para mejorar el servicio, cumplir normativa o reforzar seguridad. Los cambios relevantes seran comunicados por canales oficiales.",
    },
    {
        title: "8. Marco de copropiedad",
        body: "La operacion debe alinearse con el reglamento de copropiedad, acuerdos de asamblea, instrucciones de administracion y la Ley 21.442 de Copropiedad Inmobiliaria cuando aplique.",
    },
];

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-slate-50 p-8 pt-12 cc-text-primary dark:bg-[#0B0F19] md:p-16">
            <div className="mx-auto max-w-4xl">
                <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold text-role-admin-fg transition-opacity hover:opacity-80">
                    <ArrowLeft className="h-5 w-5" /> Regresar
                </Link>
                <h1 className="mb-4 text-4xl font-extrabold">Terminos del servicio</h1>
                <p className="mb-8 text-lg leading-relaxed cc-text-secondary">
                    Ultima actualizacion: junio de 2026. Al utilizar Convive Connect aceptas estas condiciones de uso.
                </p>

                <div className="space-y-8 rounded-3xl border border-subtle bg-surface p-8">
                    {terms.map(section => (
                        <section key={section.title}>
                            <h2 className="mb-3 text-xl font-bold">{section.title}</h2>
                            <p className="leading-7 cc-text-secondary">{section.body}</p>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
