"use client";

import Link from "next/link";
import { ArrowRight, Bot, ShoppingBag, Store, Wrench } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { Eyebrow } from "@/components/cc/Eyebrow";
import type { NeighborHomeProps, ResidentHomeQuickActionProps } from "@/lib/types";

/**
 * Inicio para quien vive en un edificio sin administración en Convive (modo
 * vecino) o espera que la administración lo valide.
 *
 * Antes veía el inicio de un edificio administrado: "Gasto común $0 · Ver
 * gastos", "0 reservas", accesos a Reservar, Invitar visitas e Informarme, y
 * a CoCo al fondo ofreciendo revisar cobros y reservar. Todo eso lleva a un
 * muro en modo vecino. Los primeros 7 residentes que llegaron así entraron
 * unos minutos y no volvieron; ninguno le escribió a CoCo.
 *
 * Aquí solo aparece lo que funciona, con CoCo primero y preguntas que abren
 * el chat ya respondiendo (/chat?q=…).
 */

const STARTERS = [
    "Compara precios de mi lista del súper: leche, pan, huevos, arroz y café",
    "Necesito un gasfiter de confianza cerca de mi edificio",
    "Quiero vender un mueble a mis vecinos, ¿cómo lo publico?",
];

export function NeighborHome({ firstName, buildingName, pendingValidation, initials }: NeighborHomeProps) {
    return (
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-4 sm:px-8">
            <div className="mb-6 flex items-center justify-between pt-1">
                <Brand size={16} withMark />
                <Link
                    href="/profile"
                    className="grid place-items-center font-mono text-[12px] font-semibold text-ink"
                    style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)" }}
                >
                    {initials}
                </Link>
            </div>

            <section className="mb-6">
                <h1 className="text-[40px] leading-[1] tracking-[-0.03em] cc-text-primary sm:text-[52px]" style={{ fontFamily: "var(--cc-font-display)" }}>
                    Hola, <em style={{ color: "var(--cc-copper-text)", fontStyle: "italic" }}>{firstName}.</em>
                </h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-6 cc-text-secondary">
                    {pendingValidation
                        ? `Mientras la administración de ${buildingName} confirma que vives ahí, esto ya funciona para ti:`
                        : `${buildingName} todavía no tiene administración en Convive. Mientras tanto, esto ya funciona para ti y tus vecinos:`}
                </p>
            </section>

            <section className="mb-6 rounded-[22px] border p-5 sm:p-7" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}>
                <div className="mb-4 flex items-start gap-3">
                    <div className="grid shrink-0 place-items-center" style={{ width: 44, height: 44, borderRadius: 14, background: "var(--cc-carbon)", color: "var(--cc-copper-soft)" }}>
                        <Bot size={20} />
                    </div>
                    <div>
                        <h2 className="text-[17px] font-semibold cc-text-primary">Pregúntale a CoCo</h2>
                        <p className="mt-1 text-[13px] leading-5 cc-text-secondary">
                            Tu asistente: compara precios del súper, encuentra maestros con buenas reseñas y te ayuda a vender o comprar entre vecinos. Toca una pregunta para empezar.
                        </p>
                    </div>
                </div>
                <div className="grid gap-2">
                    {STARTERS.map(question => (
                        <Link
                            key={question}
                            href={`/chat?q=${encodeURIComponent(question)}`}
                            className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[14px] cc-text-primary transition-colors hover:bg-[var(--cc-copper-tint)]"
                            style={{ borderColor: "var(--cc-line)" }}
                        >
                            <span>{question}</span>
                            <ArrowRight size={15} className="shrink-0" style={{ color: "var(--cc-copper-text)" }} />
                        </Link>
                    ))}
                    <Link href="/chat" className="mt-1 text-center text-[13px] font-semibold underline" style={{ color: "var(--cc-copper-text)" }}>
                        O escríbele lo que necesites
                    </Link>
                </div>
            </section>

            <Eyebrow className="mb-3">Lo que ya puedes usar</Eyebrow>
            <div className="grid gap-3 sm:grid-cols-3">
                <Tile href="/resident/supermercado" icon={<Store size={19} />} title="Supermercado" detail="Compara precios entre cadenas y arma tu carro." />
                <Tile href="/marketplace" icon={<ShoppingBag size={19} />} title="Marketplace" detail="Compra, vende o permuta con tus vecinos." />
                <Tile href="/services" icon={<Wrench size={19} />} title="Maestros de confianza" detail="Gasfiter, electricista y más, con reseñas de vecinos." />
            </div>
        </div>
    );
}

function Tile({ href, icon, title, detail }: ResidentHomeQuickActionProps) {
    return (
        <Link
            href={href}
            className="group flex min-h-[112px] flex-col justify-between border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
            style={{ borderColor: "var(--cc-line)", borderRadius: 18, background: "var(--cc-paper)" }}
        >
            <div className="flex items-start justify-between">
                <div className="grid place-items-center" style={{ width: 36, height: 36, borderRadius: 11, background: "var(--cc-copper-tint)", color: "var(--cc-copper-text)" }}>{icon}</div>
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" style={{ color: "var(--cc-ink-tertiary)" }} />
            </div>
            <div>
                <div className="text-[14px] font-semibold cc-text-primary">{title}</div>
                <div className="mt-1 text-[12px] cc-text-secondary">{detail}</div>
            </div>
        </Link>
    );
}
