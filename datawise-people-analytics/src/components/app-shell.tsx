"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Sparkles } from "lucide-react";
import type { PropsWithChildren } from "react";

import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f1ea_0%,#eef3f6_45%,#f7fafb_100%)]">
      <div className="mx-auto grid min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-[32px] border border-[#17314f]/70 bg-[linear-gradient(180deg,#10213c_0%,#17314f_55%,#1c4465_100%)] px-6 py-8 text-slate-100 shadow-[0_28px_90px_-44px_rgba(16,33,60,0.88)]">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/7 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                <Sparkles className="size-3.5" />
                Demo DataWise
              </div>
              <div>
                <h1 className="font-serif text-3xl font-semibold tracking-tight text-white">
                  Analitica de Personas
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Salud organizacional, alertas individuales, vista por equipo y carga
                  gobernada de datos en un solo espacio de trabajo.
                </p>
              </div>
            </div>

            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-3xl border px-4 py-4 transition-colors",
                      active
                        ? "border-white/18 bg-white/14 text-white"
                        : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <item.icon className="mt-0.5 size-4 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">{item.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">
                          {item.description}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="rounded-[28px] border border-white/10 bg-white/7 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                <Database className="size-3.5" />
                Alcance actual
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>Dashboard ejecutivo y cola priorizada de personas sobre Prisma</li>
                <li>Pipeline analitico con scoring explicable de fuga y burnout</li>
                <li>Lectura operativa por manager, area y siguiente accion sugerida</li>
                <li>Carga gobernada de CSV/XLSX a tablas normalizadas de RR.HH.</li>
                <li>Datos demo listos para una historia comercial completa</li>
              </ul>
            </div>
          </div>
        </aside>

        <main className="min-w-0 py-2">{children}</main>
      </div>
    </div>
  );
}
