"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/authContext";
import { HomeService } from "@/lib/api";
import type { ResidentHomeQuickActionProps, ResidentHomeStatusPillProps, ResidentHomeSummary } from "@/lib/types";
import { Bell, ChevronRight, ArrowRight, Sparkles, BellRing, Bot, CalendarCheck, CreditCard, Wrench, QrCode, Megaphone } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";
import { Button } from "@/components/cc/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function HomePage() {
    const { user } = useAuth();
    const router = useRouter();
    const [statsData, setStatsData] = useState<ResidentHomeSummary>({
        pendingExpensesCount: 0,
        pendingExpensesAmount: 0,
        bookingsCount: 0,
        recentAnnouncement: null,
    });

    // ── Role Redirects ──
    useEffect(() => {
        if (user) {
            if (user.role === "admin") {
                router.replace("/admin");
            } else if (user.role === "concierge") {
                router.replace("/concierge");
            }
        }
    }, [user, router]);

    // ── Fetch Resident Data ──
    useEffect(() => {
        if (!user || user.role !== "resident") return;

        const fetchData = async () => {
            try {
                setStatsData(await HomeService.getResidentSummary(user));
            } catch (err) {
                console.error("Error fetching resident home data:", err);
            }
        };

        fetchData();
    }, [user]);

    if (!user || user.role !== "resident") return null;

    const firstName = user.name ? user.name.split(" ")[0] : "vecino";
    const initials = user.name
        ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
        : "U";

    const dateToday = new Date().toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    return (
        <ErrorBoundary name="Resident Home Screen">
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-4 sm:px-8 lg:px-10">
                {/* Top bar */}
                <div className="mb-6 flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2.5">
                        <Brand size={16} withMark />
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href="/feed"
                            aria-label="Ver comunicaciones"
                            className="grid place-items-center relative cursor-pointer"
                            style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
                        >
                            <Bell size={16} />
                            {statsData.recentAnnouncement && (
                                <span
                                    className="absolute"
                                    style={{
                                        top: 9, right: 9,
                                        width: 6, height: 6,
                                        borderRadius: 999, background: "var(--cc-copper)",
                                    }}
                                />
                            )}
                        </Link>
                        <Link
                            href="/profile"
                            className="grid place-items-center font-mono text-[12px] font-semibold text-ink"
                            style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
                        >
                            {initials}
                        </Link>
                    </div>
                </div>

                <section className={user.communityCoverPhotoUrl ? "grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]" : "grid"}>
                {/* Greeting and today's priorities */}
                <div
                    className="flex min-h-[280px] flex-col justify-between border p-7 sm:p-9"
                    style={{ borderColor: "var(--cc-line)", borderRadius: 22, background: "var(--cc-paper-warm)" }}
                >
                    <div>
                        <Eyebrow className="mb-3">{dateToday}</Eyebrow>
                        <DisplayHeading size={46}>
                            Hola, <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>{firstName}.</em>
                        </DisplayHeading>
                        <p className="mt-3 max-w-xl text-[14px] leading-relaxed" style={{ color: "var(--cc-ink-muted)" }}>
                            Todo lo importante de tu hogar y tu comunidad, en un solo lugar.
                        </p>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-2">
                        {user.unitName && <StatusPill label={user.unitName} />}
                        <StatusPill label={`${statsData.bookingsCount} ${statsData.bookingsCount === 1 ? "reserva" : "reservas"}`} />
                        <StatusPill
                            label={statsData.pendingExpensesCount > 0 ? `${statsData.pendingExpensesCount} pago pendiente` : "Pagos al día"}
                            alert={statsData.pendingExpensesCount > 0}
                        />
                    </div>
                </div>

                {/* Real building photo — only shown to residents of a community that has one configured */}
                {user.communityCoverPhotoUrl && (
                    <div className="relative min-h-[250px] overflow-hidden sm:min-h-[300px]" style={{ borderRadius: 22 }}>
                        <Image
                            src={user.communityCoverPhotoUrl}
                            alt="Foto de tu edificio"
                            fill
                            priority
                            sizes="(min-width: 1024px) 460px, 100vw"
                            className="object-cover"
                        />
                        <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(26,22,17,0.72) 0%, transparent 62%)" }} />
                        <div className="absolute bottom-5 left-5" style={{ color: "var(--cc-paper)" }}>
                            <Eyebrow style={{ color: "rgba(244,239,230,0.72)", marginBottom: 5 }}>Tu hogar</Eyebrow>
                            <p className="text-[18px] font-medium">Mi comunidad</p>
                        </div>
                    </div>
                )}
                </section>

                <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                <div className="space-y-5">

                {/* Featured: pending bill */}
                <div
                    className="relative overflow-hidden"
                    style={{ borderRadius: 22, padding: 22, background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                >
                    <div
                        aria-hidden
                        style={{
                            position: "absolute", top: -20, right: -30,
                            width: 180, height: 180, borderRadius: "50%",
                            background: "radial-gradient(circle, rgba(156, 86, 54,0.35) 0%, transparent 60%)",
                        }}
                    />
                    <div className="relative mb-5 flex items-start justify-between">
                        <div>
                            <Eyebrow style={{ color: "rgba(244,239,230,0.55)", marginBottom: 10 }}>Gasto común</Eyebrow>
                            <div style={{ fontSize: 13, color: "rgba(244,239,230,0.75)" }}>
                                {statsData.pendingExpensesCount > 0 ? "Mes actual · vence pronto" : "Al día · sin deuda"}
                            </div>
                        </div>
                        <Tag tone="ink" solid dot={statsData.pendingExpensesCount > 0}>
                            {statsData.pendingExpensesCount > 0 ? "Por pagar" : "Al día"}
                        </Tag>
                    </div>

                    <div className="relative mb-5 flex items-baseline gap-1.5">
                        <span style={{ fontSize: 14, color: "rgba(244,239,230,0.6)" }}>$</span>
                        <span style={{ fontFamily: "var(--cc-font-display)", fontSize: 54, lineHeight: 1, letterSpacing: "-0.02em" }}>
                            {statsData.pendingExpensesAmount.toLocaleString("es-CL")}
                        </span>
                        <span className="font-mono ml-1.5" style={{ fontSize: 11, color: "rgba(244,239,230,0.5)" }}>CLP</span>
                    </div>

                    <Link href="/expenses">
                        <Button variant="copper" size="lg" block>
                            {statsData.pendingExpensesCount > 0 ? "Pagar ahora" : "Ver gastos"} <ArrowRight size={16} />
                        </Button>
                    </Link>
                </div>

                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <Eyebrow>Acciones rápidas</Eyebrow>
                        <span className="text-[11px]" style={{ color: "var(--cc-ink-tertiary)" }}>Lo más usado</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <QuickAction href="/amenities" icon={<CalendarCheck size={18} />} title="Reservar espacio" detail="Amenidades" />
                        <QuickAction href="/resident/invitations" icon={<QrCode size={18} />} title="Crear invitación" detail="Acceso de visitas" />
                        <QuickAction href="/services" icon={<Wrench size={18} />} title="Pedir un servicio" detail="Hogar y mantención" />
                        <QuickAction href="/feed" icon={<Megaphone size={18} />} title="Ver comunicaciones" detail="Noticias del edificio" />
                    </div>
                </div>

                </div>
                <div className="space-y-5">

                {/* Latest community update */}
                <div>
                <Eyebrow className="mb-3">Lo último en tu comunidad</Eyebrow>
                {statsData.recentAnnouncement && (
                    <Link
                        href="/feed"
                        className="flex gap-3 items-start bg-paper border rounded-xl"
                        style={{ borderColor: "var(--cc-line)", borderRadius: 18, padding: 16 }}
                    >
                        <div
                            className="grid place-items-center shrink-0"
                            style={{ width: 36, height: 36, borderRadius: 10, background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}
                        >
                            <BellRing size={16} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2 mb-1">
                                <Tag tone="copper" size="sm">{statsData.recentAnnouncement.category}</Tag>
                                <span className="font-mono" style={{ fontSize: 10, color: "var(--cc-ink-tertiary)" }}>{statsData.recentAnnouncement.time}</span>
                            </div>
                            <div style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 500, color: "var(--cc-ink)" }}>{statsData.recentAnnouncement.title}</div>
                            <div style={{ fontSize: 12, color: "var(--cc-ink-muted)", marginTop: 4, lineHeight: 1.4 }} className="line-clamp-2">
                                {statsData.recentAnnouncement.content}
                            </div>
                        </div>
                        <ChevronRight size={16} color="var(--cc-ink-faint)" className="shrink-0 self-center" />
                    </Link>
                )}
                {!statsData.recentAnnouncement && (
                    <div className="border p-5 text-[13px]" style={{ borderColor: "var(--cc-line)", borderRadius: 18, color: "var(--cc-ink-muted)" }}>
                        No hay comunicaciones nuevas por ahora.
                    </div>
                )}
                </div>

                {/* CoCo resident assistant */}
                <Link
                    href="/chat"
                    className="block border bg-paper"
                    style={{
                        borderColor: "var(--cc-line-strong)",
                        borderRadius: 18,
                        padding: 18,
                    }}
                >
                    <div className="flex items-start gap-3">
                        <div className="grid shrink-0 place-items-center" style={{ width: 40, height: 40, borderRadius: 13, background: "var(--cc-ink)", color: "var(--cc-copper-soft)" }}>
                            <Bot size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[14px] font-semibold cc-text-primary">Resuélvelo con CoCo</div>
                                <ChevronRight size={16} color="var(--cc-ink-faint)" />
                            </div>
                            <p className="mt-1.5 text-[12px] leading-5 cc-text-secondary">
                                Revisa cobros, reserva espacios, registra visitas o abre una solicitud.
                            </p>
                            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold" style={{ color: "var(--cc-copper)" }}>
                                <Sparkles size={13} /> Hablar con CoCo
                            </div>
                        </div>
                    </div>
                </Link>
                </div>
                </div>
            </div>
        </ErrorBoundary>
    );
}

function StatusPill({ label, alert = false }: ResidentHomeStatusPillProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium" style={{ borderColor: alert ? "rgba(180,83,62,0.28)" : "var(--cc-line)", background: alert ? "rgba(180,83,62,0.08)" : "var(--cc-paper)", color: alert ? "var(--cc-rose)" : "var(--cc-ink-muted)" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: alert ? "var(--cc-rose)" : "var(--cc-sage)" }} />
      {label}
    </span>
  );
}

function QuickAction({ href, icon, title, detail }: ResidentHomeQuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-[118px] flex-col justify-between border bg-paper p-4 transition-transform hover:-translate-y-0.5"
      style={{ borderColor: "var(--cc-line)", borderRadius: 18 }}
    >
      <div className="flex items-start justify-between">
        <div className="grid place-items-center" style={{ width: 36, height: 36, borderRadius: 11, background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>{icon}</div>
        <ArrowRight size={15} color="var(--cc-ink-faint)" className="transition-transform group-hover:translate-x-0.5" />
      </div>
      <div>
        <div className="text-[13px] font-semibold" style={{ color: "var(--cc-ink)" }}>{title}</div>
        <div className="mt-1 text-[11px]" style={{ color: "var(--cc-ink-tertiary)" }}>{detail}</div>
      </div>
    </Link>
  );
}
