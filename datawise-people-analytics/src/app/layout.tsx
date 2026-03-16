import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "DataWise People Analytics",
  description:
    "Analitica de personas para liderazgo, enfocada en salud organizacional, senales de engagement y riesgo explicable."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <header className="sticky top-0 z-20 border-b border-white/60 bg-[rgba(245,242,236,0.82)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-6">
            <Link href="/" className="flex items-center gap-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#10213c_0%,#1d5f7d_100%)] text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_16px_36px_-20px_rgba(16,33,60,0.75)]">
                DW
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  DataWise
                </p>
                <p className="font-serif text-2xl font-semibold text-slate-950">
                  Inteligencia de Personas
                </p>
              </div>
            </Link>

            <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/70 px-2 py-2 shadow-[0_18px_40px_-28px_rgba(16,33,60,0.3)] md:flex">
              <Link
                href="/"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Resumen
              </Link>
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Vista ejecutiva
              </Link>
              <Link
                href="/departments"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Vista por equipo
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/dashboard" className={buttonVariants()}>
                Abrir demo
              </Link>
              <Link
                href="/upload"
                className={buttonVariants({ variant: "secondary" })}
              >
                Revisar carga
              </Link>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
