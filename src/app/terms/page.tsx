import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 p-8 pt-12 md:p-16">
            <div className="max-w-4xl mx-auto">
                <Link href="/" className="inline-flex items-center gap-2 mb-8 text-indigo-600 dark:text-indigo-400 hover:opacity-80 transition-opacity font-semibold">
                    <ArrowLeft className="w-5 h-5" /> Regresar
                </Link>
                <h1 className="text-4xl font-extrabold mb-8">Términos del Servicio</h1>

                <div className="prose prose-slate dark:prose-invert">
                    <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                        Última actualización: Noviembre 2026. Al utilizar ComunidadConnect, usted acepta los siguientes términos y condiciones.
                    </p>
                    <div className="space-y-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8">
                        <section>
                            <h2 className="text-xl font-bold mb-3">1. Uso de la Plataforma</h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                Esta plataforma es para el uso exclusivo de los residentes y administradores autorizados. Cualquier acceso no autorizado resultará en su expulsión a nivel plataforma.
                            </p>
                        </section>
                        <section>
                            <h2 className="text-xl font-bold mb-3">2. Responsabilidad</h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                ComunidadConnect facilita la comunicación y gestión de pagos pero no asume responsabilidad directa por disputas entre la comunidad, la conserjería ni administradores locales.
                            </p>
                        </section>
                        <section>
                            <h2 className="text-xl font-bold mb-3">3. Modificaciones</h2>
                            <p className="text-slate-600 dark:text-slate-400">
                                Nos reservamos el derecho de modificar estos términos para adaptarnos a exigencias legales o mejoras en el sistema. Todos los cambios serán notificados.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
