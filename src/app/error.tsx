"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Application error:", error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-rose-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-rose-950/20 p-6">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-md w-full text-center"
            >
                {/* Icon */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                    className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-xl shadow-rose-500/30 flex items-center justify-center mb-6"
                >
                    <AlertTriangle className="h-10 w-10 text-white" />
                </motion.div>

                {/* Text */}
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
                    ¡Algo salió mal!
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    Ocurrió un error inesperado. Puedes intentar recargar la página o volver al inicio.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-semibold shadow-lg shadow-rose-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Reintentar
                    </button>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5 transition-all"
                    >
                        <Home className="h-4 w-4" />
                        Ir al Inicio
                    </Link>
                </div>

                {/* Error details (dev) */}
                {process.env.NODE_ENV === "development" && error.message && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-8 p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-left"
                    >
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">
                            {error.message}
                        </p>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
