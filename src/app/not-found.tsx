import Link from 'next/link';
import { Home, AlertCircle } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-surface p-8 rounded-3xl shadow-xl w-full max-w-md border border-subtle flex flex-col items-center">
                <div className="w-20 h-20 bg-role-admin-bg rounded-2xl flex items-center justify-center mb-6">
                    <AlertCircle className="w-10 h-10 text-brand-500" />
                </div>

                <h1 className="text-4xl font-extrabold cc-text-primary mb-2">404</h1>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Página no encontrada</h2>

                <p className="cc-text-secondary mb-8 leading-relaxed">
                    Lo sentimos, la página que buscas no existe o ha sido movida. Verifica que la URL sea correcta.
                </p>

                <Link
                    href="/home"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 transition-colors text-white font-semibold w-full justify-center shadow-lg shadow-indigo-500/30"
                >
                    <Home className="w-5 h-5" />
                    Te llevamos al Inicio
                </Link>
            </div>
        </div>
    );
}
