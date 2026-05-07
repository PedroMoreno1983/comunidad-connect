import Link from "next/link";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-6 text-center">
      <div className="flex w-full max-w-md flex-col items-center rounded-lg border border-subtle bg-surface p-6 shadow-sm">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-600">
          <AlertCircle className="h-5 w-5" />
        </div>

        <h1 className="text-3xl font-semibold cc-text-primary">404</h1>
        <h2 className="mt-2 text-lg font-semibold cc-text-primary">Página no encontrada</h2>

        <p className="mt-3 leading-6 cc-text-secondary">
          La página que buscas no existe o fue movida. Verifica la URL o vuelve al inicio.
        </p>

        <Link
          href="/home"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Home className="h-4 w-4" />
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
