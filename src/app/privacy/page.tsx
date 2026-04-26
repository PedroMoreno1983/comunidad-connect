import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] cc-text-primary p-8 pt-12 md:p-16">
            <div className="max-w-4xl mx-auto">
                <Link href="/" className="inline-flex items-center gap-2 mb-8 text-role-admin-fg hover:opacity-80 transition-opacity font-semibold">
                    <ArrowLeft className="w-5 h-5" /> Regresar
                </Link>
                <h1 className="text-4xl font-extrabold mb-8">Políticas de Privacidad</h1>

                <div className="prose prose-slate dark:prose-invert">
                    <p className="text-lg cc-text-secondary leading-relaxed mb-6">
                        Última actualización: Noviembre 2026. En ComunidadConnect respetamos su privacidad y protegemos sus datos personales.
                    </p>
                    <div className="space-y-8 bg-surface border border-subtle rounded-3xl p-8">
                        <section>
                            <h2 className="text-xl font-bold mb-3">1. Recolección de Datos</h2>
                            <p className="cc-text-secondary">
                                Recolectamos información necesaria para la gestión y seguridad de su comunidad, incluyendo nombre, unidad o departamento, y datos de contacto.
                            </p>
                        </section>
                        <section>
                            <h2 className="text-xl font-bold mb-3">2. Uso de la Información</h2>
                            <p className="cc-text-secondary">
                                Utilizamos los datos exclusivamente para facilitar la comunicación, pagos de gastos, reservas y propósitos de conserjería. No vendemos ni compartimos sus datos con terceros.
                            </p>
                        </section>
                        <section>
                            <h2 className="text-xl font-bold mb-3">3. Seguridad</h2>
                            <p className="cc-text-secondary">
                                Implementamos estándares corporativos de encriptación y utilizamos la infraestructura segura provista por líderes en la nube para salvaguardar su información.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
