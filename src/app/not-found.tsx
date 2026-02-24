import { Building2, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 p-6">
            <div className="max-w-md w-full text-center">
                {/* 404 Number */}
                <div className="relative mb-6">
                    <span className="text-[10rem] font-black leading-none text-transparent bg-clip-text bg-gradient-to-br from-indigo-200 to-purple-200 dark:from-indigo-800/50 dark:to-purple-800/50 select-none">
                        404
                    </span>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/30">
                            <Search className="h-8 w-8 text-white" />
                        </div>
                    </div>
                </div>

                {/* Text */}
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
                    Página no encontrada
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    La página que buscas no existe o fue movida. Verifica la URL o regresa al inicio.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/home"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                    >
                        <Building2 className="h-4 w-4" />
                        Ir al Dashboard
                    </Link>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver al Inicio
                    </Link>
                </div>
            </div>
        </div>
    );
}
