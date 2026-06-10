"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { HomeService } from "@/lib/api";
import type { ResidentHomeSummary } from "@/lib/types";
import { Bell, ChevronRight, ArrowRight, Mic, Sparkles, Droplets, Waves, BellRing, Bot, CalendarCheck, CreditCard, Wrench } from "lucide-react";
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

    const firstName = user.name ? user.name.split(" ")[0] : "Martina";
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
            <div className="max-w-md mx-auto px-5 pt-3.5 pb-6">
                {/* Top bar */}
                <div className="flex items-center justify-between mb-8 pt-1">
                    <div className="flex items-center gap-2.5">
                        <Brand size={16} withMark />
                    </div>
                    <div className="flex gap-2">
                        <button
                            className="grid place-items-center relative cursor-pointer"
                            style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
                        >
                            <Bell size={16} />
                            <span
                                className="absolute"
                                style={{
                                    top: 9, right: 9,
                                    width: 6, height: 6,
                                    borderRadius: 999, background: "var(--cc-copper)",
                                }}
                            />
                        </button>
                        <Link
                            href="/profile"
                            className="grid place-items-center font-mono text-[12px] font-semibold text-ink"
                            style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
                        >
                            {initials}
                        </Link>
                    </div>
                </div>

                {/* Greeting — editorial */}
                <div className="mb-7">
                    <Eyebrow className="mb-3">{dateToday}</Eyebrow>
                    <DisplayHeading size={46}>
                        Buenos días,<br />
                        <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>{firstName}.</em>
                    </DisplayHeading>
                    <p className="mt-3.5 text-[14px] leading-relaxed" style={{ color: "var(--cc-ink-muted)" }}>
                        Tu comunidad está al día. Tienes{" "}
                        <span className="text-ink font-semibold">{statsData.bookingsCount} {statsData.bookingsCount === 1 ? "reserva" : "reservas"}</span>{" "}
                        esta semana y{" "}
                        {statsData.pendingExpensesCount > 0 ? (
                            <span><span className="text-[var(--cc-rose)] font-semibold">{statsData.pendingExpensesCount} cuenta pendiente</span> por pagar.</span>
                        ) : (
                            <span><span className="text-ink font-semibold">nada pendiente</span> por pagar.</span>
                        )}
                    </p>
                </div>

                {/* Featured: pending bill */}
                <div
                    className="relative overflow-hidden mb-5"
                    style={{ borderRadius: 22, padding: 22, background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                >
                    <div
                        aria-hidden
                        style={{
                            position: "absolute", top: -20, right: -30,
                            width: 180, height: 180, borderRadius: "50%",
                            background: "radial-gradient(circle, rgba(181,102,78,0.35) 0%, transparent 60%)",
                        }}
                    />
                    <div className="relative flex justify-between items-start mb-6">
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

                    <div className="relative flex items-baseline gap-1.5 mb-5">
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

                <Link
                    href="/chat"
                    className="block border bg-paper mb-5"
                    style={{ borderColor: "var(--cc-line-strong)", borderRadius: 18, padding: 16 }}
                >
                    <div className="flex items-start gap-3">
                        <div
                            className="grid place-items-center shrink-0"
                            style={{ width: 38, height: 38, borderRadius: 12, background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}
                        >
                            <Bot size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[13px] font-semibold cc-text-primary">CoCo puede ejecutarlo contigo</div>
                                <ChevronRight size={15} color="var(--cc-ink-faint)" className="shrink-0" />
                            </div>
                            <p className="mt-1.5 text-[12px] leading-5 cc-text-secondary">
                                Pide pagar tu cuenta, reservar un espacio, registrar una visita o abrir una solicitud con trazabilidad.
                            </p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                <AgentChip icon={<CreditCard size={12} />} label="Pagar" />
                                <AgentChip icon={<CalendarCheck size={12} />} label="Reservar" />
                                <AgentChip icon={<Wrench size={12} />} label="Ticket" />
                            </div>
                        </div>
                    </div>
                </Link>

                {/* For today — grid */}
                <Eyebrow className="mt-5 mb-3">Para hoy</Eyebrow>
                <div className="grid grid-cols-2 gap-3.5 mb-5">
                    <QuickCard
                        icon={<Waves size={14} color="var(--cc-sage)" />}
                        tint="var(--cc-sage-tint)"
                        eyebrow="Reserva"
                        title="Piscina"
                        sub="Sáb · 11:00 – 12:30"
                    />
                    <QuickCard
                        icon={<Droplets size={14} color="#3B82F6" />}
                        tint="rgba(96,165,250,0.12)"
                        eyebrow="Consumo agua"
                        title="8.4 m³"
                        sub="−12% vs abril"
                        subColor="var(--cc-sage)"
                    />
                </div>

                {/* Announcement */}
                {statsData.recentAnnouncement && (
                    <Link
                        href="/feed"
                        className="flex gap-3 items-start mb-5 bg-paper border rounded-xl"
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

                {/* Coco prompt */}
                <Link
                    href="/chat"
                    className="flex items-center gap-3 bg-paper sticky bottom-0 mt-2"
                    style={{
                        borderRadius: 999,
                        padding: "14px 18px",
                        border: "1px solid var(--cc-line-strong)",
                        boxShadow: "var(--cc-shadow-lg)",
                    }}
                >
                    <div
                        className="grid place-items-center"
                        style={{ width: 26, height: 26, borderRadius: 999, background: "var(--cc-ink)", color: "var(--cc-copper-soft)" }}
                    >
                        <Sparkles size={12} color="var(--cc-copper-soft)" />
                    </div>
                    <span className="flex-1 text-left" style={{ fontSize: 13, color: "var(--cc-ink-muted)" }}>
                        Pregúntale a Coco…
                    </span>
                    <Mic size={16} color="var(--cc-ink-tertiary)" />
                </Link>
            </div>
        </ErrorBoundary>
    );
}

function QuickCard({
  icon, tint, eyebrow, title, sub, subColor,
}: { icon: React.ReactNode; tint: string; eyebrow: string; title: string; sub: string; subColor?: string }) {
  return (
    <div className="border rounded-xl" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)", padding: 16, borderRadius: 18 }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="grid place-items-center" style={{ width: 28, height: 28, borderRadius: 8, background: tint }}>
          {icon}
        </div>
        <div style={{ fontSize: 11, color: "var(--cc-ink-tertiary)" }}>{eyebrow}</div>
      </div>
      <div style={{ fontFamily: "var(--cc-font-display)", fontSize: 20, lineHeight: 1.05, marginBottom: 4, color: "var(--cc-ink)" }}>{title}</div>
      <div className="font-mono" style={{ fontSize: 11, color: subColor ?? "var(--cc-ink-muted)" }}>{sub}</div>
    </div>
  );
}

function AgentChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold"
      style={{ borderColor: "var(--cc-line)", color: "var(--cc-ink-muted)" }}
    >
      {icon}
      {label}
    </span>
  );
}
