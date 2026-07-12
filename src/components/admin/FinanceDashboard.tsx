"use client";

import {
    Activity,
    AlertCircle,
    Calendar,
    CheckCircle2,
    DollarSign,
    PieChart,
    TrendingDown,
    TrendingUp,
    Users,
    Wallet,
} from "lucide-react";
import { CommunityFinance } from "@/lib/types";
import { ExpenseAreaChart, ExpensePieChart } from "@/components/charts/Charts";
import { BladeFan } from "@/components/cc/viz/BladeFan";
import { DATA_PALETTE, FoldedBar } from "@/components/cc/viz/FoldedBar";
import { DotMatrix } from "@/components/cc/viz/DotMatrix";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

interface FinanceDashboardProps {
    data: CommunityFinance;
}

export function FinanceDashboard({ data }: FinanceDashboardProps) {
    const collectionRate = Math.max(0, Math.min(100, data.collectionRate || 0));
    const totalUnits = data.billedUnits || data.totalUnits || 0;
    const paidUnits = data.paidUnits || 0;
    const recentActivity = data.recentActivity ?? [];
    const currentPeriod = new Date(`${data.period}-02T12:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    const matrixColumns = Math.min(32, Math.max(1, Math.ceil(Math.max(totalUnits, 1) / 6)));
    const matrixRows = Math.max(1, Math.ceil(Math.max(totalUnits, 1) / matrixColumns));

    const scrollToSection = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const printFinancialReport = () => {
        window.print();
    };

    const stats = [
        {
            label: "Recaudación mensual",
            value: `$${(data.totalRevenue || 0).toLocaleString("es-CL")}`,
            detail: "Ingresos por gastos comunes y reservas",
            icon: DollarSign,
        },
        {
            label: "Facturación del periodo",
            value: `$${(data.totalBilled || 0).toLocaleString("es-CL")}`,
            detail: "Cobros emitidos a las unidades",
            icon: TrendingDown,
        },
        {
            label: "Aporte a fondo de reserva",
            value: `$${(data.reserveFund || 0).toLocaleString("es-CL")}`,
            detail: data.reserveFund > 0 ? "Aportes identificados en el desglose" : "Sin desglose configurado para este periodo",
            icon: Wallet,
        },
        {
            label: "Tasa de cobranza",
            value: `${collectionRate}%`,
            detail: "Porcentaje recaudado sobre lo facturado",
            icon: Activity,
        },
    ];

    const expenseChartData = data.monthlyTrend || [];
    const categoryColors = [DATA_PALETTE.blue, DATA_PALETTE.green, DATA_PALETTE.yellow, DATA_PALETTE.copper, DATA_PALETTE.orange];
    const expenseCategoryData = (data.categoryBreakdown || []).map((item, index) => ({
        ...item,
        color: item.color || categoryColors[index % categoryColors.length],
    }));

    const executiveMetrics = [
        {
            label: "Cobranza",
            value: Number((collectionRate / 20).toFixed(2)),
            delta: `${collectionRate}%`,
            color: DATA_PALETTE.copper,
            caption: "Pago efectivo del mes",
        },
        {
            label: "Reserva",
            value: data.reserveFund > 0 ? 4.2 : 1.2,
            delta: data.reserveFund > 0 ? "+OK" : "base",
            color: DATA_PALETTE.green,
            caption: "Liquidez para contingencias",
        },
        {
            label: "Egresos",
            value: data.totalBilled > 0 ? Math.min(5, Math.max(1, collectionRate / 20)) : 1,
            delta: `$${data.totalBilled.toLocaleString("es-CL")}`,
            color: DATA_PALETTE.orange,
            caption: "Facturación del periodo",
        },
        {
            label: "Actividad",
            value: Math.min(5, Math.max(1, recentActivity.length + 1)),
            delta: `${recentActivity.length}`,
            color: DATA_PALETTE.blue,
            caption: "Movimientos recientes",
        },
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <Eyebrow className="mb-2">Control financiero</Eyebrow>
                    <DisplayHeading size={30}>Recaudación y movimientos</DisplayHeading>
                    <p className="mt-2 text-sm font-medium cc-text-secondary">Recaudación, egresos, cobranza y movimientos de la comunidad.</p>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <Calendar className="h-4 w-4 cc-text-secondary" />
                    <span className="capitalize">{currentPeriod}</span>
                </div>
            </header>

            <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="grid grid-cols-1 divide-y divide-[var(--cc-line)] sm:grid-cols-2 sm:divide-x sm:divide-[var(--cc-line)] md:grid-cols-4 md:divide-y-0">
                    {stats.map(stat => {
                        const Icon = stat.icon;
                        return (
                            <article key={stat.label} className="p-5">
                                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                                    <Icon className="h-4 w-4" />
                                    {stat.label}
                                </div>
                                <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{stat.value}</p>
                                <p className="mt-2 text-xs font-semibold cc-text-tertiary">{stat.detail}</p>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <article className="rounded-2xl border p-5 lg:col-span-3" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-5 flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] cc-text-tertiary">Vista ejecutiva</span>
                        <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Indicadores financieros del periodo</h2>
                        <p className="text-sm cc-text-secondary">Lectura compacta de cobranza, reserva, egresos y actividad operacional.</p>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
                        <div className="overflow-hidden rounded-xl px-2 py-4" style={{ background: "var(--cc-paper-warm)" }}>
                            <div className="flex min-h-[300px] justify-center overflow-x-auto">
                                <BladeFan
                                    width={400}
                                    height={300}
                                    origin={{ x: 58, y: 262 }}
                                    startAngle={10}
                                    endAngle={82}
                                    maxLen={188}
                                    bladeWidth={13}
                                    blades={executiveMetrics.map(metric => ({
                                        value: metric.value,
                                        max: 5,
                                        color: metric.color,
                                        delta: metric.delta,
                                    }))}
                                    gridRings={[1, 2, 3, 4, 5]}
                                />
                            </div>
                        </div>

                        <div className="grid content-center gap-3">
                            {executiveMetrics.map(metric => (
                                <div key={metric.label} className="rounded-xl border p-3" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: metric.color }} />
                                            <span className="text-sm font-semibold cc-text-primary">{metric.label}</span>
                                        </div>
                                        <span className="font-mono text-xs font-bold cc-text-tertiary">{metric.delta}</span>
                                    </div>
                                    <p className="mb-2 text-xs font-semibold cc-text-secondary">{metric.caption}</p>
                                    <FoldedBar pct={(metric.value / 5) * 100} color={metric.color} orientation="horizontal" thickness={8} />
                                </div>
                            ))}
                        </div>
                    </div>
                </article>

                <article className="rounded-2xl border p-5 lg:col-span-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-5 flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] cc-text-tertiary">Cobranza por unidades</span>
                        <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{paidUnits} de {totalUnits} unidades al día</h2>
                        <p className="text-sm cc-text-secondary">Cada punto representa una unidad del condominio en el periodo actual.</p>
                    </div>

                    <div className="overflow-x-auto rounded-xl p-4" style={{ background: "var(--cc-paper-warm)" }}>
                        <DotMatrix rows={matrixRows} cols={matrixColumns} filled={paidUnits} color={DATA_PALETTE.copper} dotSize={7} gap={5} />
                    </div>

                    <div className="mt-5 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold cc-text-secondary">Avance mensual</span>
                            <span className="font-semibold cc-text-primary">{collectionRate}%</span>
                        </div>
                        <FoldedBar pct={collectionRate} color={DATA_PALETTE.copper} orientation="horizontal" thickness={10} />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl p-3" style={{ background: "var(--cc-paper-warm)" }}>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-tertiary">Pendientes</p>
                                <p className="mt-1 text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{data.pendingUnits}</p>
                            </div>
                            <div className="rounded-xl p-3" style={{ background: "var(--cc-paper-warm)" }}>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-tertiary">Riesgo</p>
                                <p className="mt-1 text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{data.overdueAmount > 0 ? "Alto" : collectionRate >= 90 ? "Bajo" : "Medio"}</p>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <article className="rounded-2xl border p-5 lg:col-span-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                            <div>
                                <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Evolución de facturación</h2>
                                <p className="text-sm cc-text-secondary">Cobros reales de los últimos 6 periodos</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={printFinancialReport}
                            className="rounded-full border px-3 py-2 text-xs font-semibold cc-text-primary transition-colors hover:bg-[var(--cc-paper-warm)]"
                            style={{ borderColor: "var(--cc-line)" }}
                        >
                            Imprimir PDF
                        </button>
                    </div>
                    <div className="h-80 w-full">
                        {expenseChartData.length > 0
                            ? <ExpenseAreaChart data={expenseChartData} />
                            : <div className="grid h-full place-items-center text-sm font-semibold cc-text-tertiary">Sin periodos financieros cargados.</div>}
                    </div>
                </article>

                <article className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-5 flex items-center gap-3">
                        <PieChart className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Distribución</h2>
                            <p className="text-sm cc-text-secondary">Por categoría</p>
                        </div>
                    </div>
                    <div className="min-h-[220px]">
                        {expenseCategoryData.length > 0
                            ? <ExpensePieChart data={expenseCategoryData} />
                            : <div className="grid min-h-[220px] place-items-center text-center text-sm font-semibold cc-text-tertiary">Carga el desglose de los gastos para ver categorías reales.</div>}
                    </div>
                    <div className="mt-5 space-y-2">
                        {expenseCategoryData.map(item => (
                            <div key={item.name} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--cc-paper-warm)" }}>
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-sm font-semibold cc-text-secondary">{item.name}</span>
                                </div>
                                <span className="text-sm font-semibold cc-text-primary">${(item.value / 1000000).toFixed(1)}M</span>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <article className="rounded-2xl border lg:col-span-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center justify-between border-b p-5" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="flex items-center gap-3">
                            <Activity className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                            <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Movimientos recientes</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => scrollToSection("cobranzas")}
                            className="text-sm font-semibold"
                            style={{ color: "var(--cc-copper)" }}
                        >
                            Ver registros
                        </button>
                    </div>
                    <div className="divide-y divide-[var(--cc-line)]">
                        {recentActivity.map(activity => (
                            <div key={activity.id} className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-[var(--cc-paper-warm)]">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full" style={activity.type === "income" ? { background: "var(--cc-success-bg)", color: "var(--cc-success-fg)" } : { background: "var(--cc-danger-bg)", color: "var(--cc-danger-fg)" }}>
                                        {activity.type === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <p className="font-semibold cc-text-primary">{activity.title}</p>
                                        <p className="text-sm cc-text-secondary">{new Date(activity.date).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`font-semibold ${activity.type === "income" ? "text-success-fg" : "cc-text-primary"}`}>
                                        {activity.type === "income" ? "+" : "-"}${(activity.amount || 0).toLocaleString("es-CL")}
                                    </p>
                                    <span className="text-xs font-semibold cc-text-tertiary">Liquidado</span>
                                </div>
                            </div>
                        ))}
                        {recentActivity.length === 0 && (
                            <p className="p-8 text-center text-sm font-semibold cc-text-tertiary">Aún no hay pagos confirmados para mostrar.</p>
                        )}
                    </div>
                </article>

                <aside className="space-y-6">
                    <article className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="mb-4 flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5" style={{ color: "var(--cc-sage)" }} />
                            <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Estado de cobranza</h2>
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{collectionRate}%</p>
                        <p className="mt-1 text-sm cc-text-secondary">Recaudación lograda</p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--cc-paper-warm)" }}>
                            <div className="h-full rounded-full" style={{ width: `${collectionRate}%`, background: "var(--cc-copper)" }} />
                        </div>
                    </article>

                    <article className="rounded-2xl border border-warning-border bg-warning-bg p-5">
                        <div className="mb-4 flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-warning-fg" />
                            <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Atención requerida</h2>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--cc-paper)" }}>
                                <span className="text-sm font-semibold cc-text-secondary">Morosos crónicos (+3m)</span>
                                <span className="font-semibold text-danger-fg">{data.chronicDebtors}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--cc-paper)" }}>
                                <span className="text-sm font-semibold cc-text-secondary">Monto vencido</span>
                                <span className="font-semibold text-warning-fg">${data.overdueAmount.toLocaleString("es-CL")}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => scrollToSection("cobranzas")}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                                style={{ background: "var(--cc-copper)" }}
                            >
                                <Users className="h-4 w-4" />
                                Gestionar cobranza
                            </button>
                        </div>
                    </article>
                </aside>
            </section>
        </div>
    );
}
