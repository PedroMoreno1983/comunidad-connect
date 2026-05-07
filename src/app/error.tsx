"use client";

import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-lg border border-subtle bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-bg text-danger-fg">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold cc-text-primary">Algo salió mal</h1>
            <p className="mt-2 text-sm leading-6 cc-text-secondary">
              Ocurrió un error inesperado. Puedes reintentar o volver al inicio.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
          <Link
            href="/home"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2.5 text-sm font-semibold cc-text-primary transition-colors hover:bg-elevated"
          >
            <Home className="h-4 w-4" />
            Ir al inicio
          </Link>
        </div>

        {process.env.NODE_ENV === "development" && error.message && (
          <p className="mt-5 break-all rounded-md border border-subtle bg-elevated p-3 font-mono text-xs cc-text-secondary">
            {error.message}
          </p>
        )}
      </div>
    </div>
  );
}
