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

interface FinanceDashboardProps {
    data: CommunityFinance;
}

export function FinanceDashboard({ data }: FinanceDashboardProps) {
    const collectionRate = Math.max(0, Math.min(100, data.collectionRate || 0));
    const totalUnits = 192;
    const paidUnits = Math.round((collectionRate / 100) * totalUnits);
    const recentActivity = data.recentActivity ?? [];
    const currentPeriod = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date());

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
            label: "Egresos totales",
            value: `$${(data.totalExpenses || 0).toLocaleString("es-CL")}`,
            detail: "Pagos a proveedores y salarios",
            icon: TrendingDown,
        },
        {
            label: "Fondo de reserva",
            value: `$${(data.reserveFund || 0).toLocaleString("es-CL")}`,
            detail: "Capital para emergencias y mejoras",
            icon: Wallet,
        },
        {
            label: "Tasa de cobranza",
            value: `${collectionRate}%`,
            detail: "Porcentaje de vecinos al día",
            icon: Activity,
        },
    ];

    const expenseChartData = [
        { month: "Sep", monto: 12500000 },
        { month: "Oct", monto: 11200000 },
        { month: "Nov", monto: 13800000 },
        { month: "Dic", monto: 15900000 },
        { month: "Ene", monto: 12100000 },
        { month: "Feb", monto: 14500000 },
    ];

    const expenseCategoryData = [
        { name: "Mantención", value: 4500000, color: DATA_PALETTE.blue },
        { name: "Sueldos", value: 6500000, color: DATA_PALETTE.green },
        { name: "Seguridad", value: 2500000, color: DATA_PALETTE.yellow },
        { name: "Servicios", value: 1000000, color: DATA_PALETTE.copper },
    ];

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
            value: data.totalExpenses > 0 ? 3.8 : 1,
            delta: "control",
            color: DATA_PALETTE.orange,
            caption: "Ejecución presupuestaria",
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
                    <h1 className="text-3xl font-bold cc-text-primary">Control financiero</h1>
                    <p className="cc-text-secondary">Recaudación, egresos, cobranza y movimientos de la comunidad.</p>
                </div>

                <div className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface px-4 py-2.5 text-sm font-semibold cc-text-primary shadow-sm">
                    <Calendar className="h-4 w-4 cc-text-secondary" />
                    <span className="capitalize">{currentPeriod}</span>
                </div>
            </header>

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="grid grid-cols-1 divide-y divide-subtle md:grid-cols-4 md:divide-x md:divide-y-0">
                    {stats.map(stat => {
                        const Icon = stat.icon;
                        return (
                            <article key={stat.label} className="p-5">
                                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                                    <Icon className="h-4 w-4" />
                                    {stat.label}
                                </div>
                                <p className="text-2xl font-semibold cc-text-primary">{stat.value}</p>
                                <p className="mt-2 text-xs font-semibold cc-text-tertiary">{stat.detail}</p>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <article className="rounded-lg border border-subtle bg-surface p-5 shadow-sm lg:col-span-3">
                    <div className="mb-5 flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] cc-text-tertiary">Vista ejecutiva</span>
                        <h2 className="text-lg font-semibold cc-text-primary">Indicadores financieros del periodo</h2>
                        <p className="text-sm cc-text-secondary">Lectura compacta de cobranza, reserva, egresos y actividad operacional.</p>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
                        <div className="overflow-hidden rounded-lg bg-canvas px-2 py-4">
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
                                <div key={metric.label} className="rounded-lg border border-subtle bg-elevated/50 p-3">
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

                <article className="rounded-lg border border-subtle bg-surface p-5 shadow-sm lg:col-span-2">
                    <div className="mb-5 flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] cc-text-tertiary">Cobranza por unidades</span>
                        <h2 className="text-lg font-semibold cc-text-primary">{paidUnits} de {totalUnits} unidades al día</h2>
                        <p className="text-sm cc-text-secondary">Cada punto representa una unidad del condominio en el periodo actual.</p>
                    </div>

                    <div className="overflow-x-auto rounded-lg bg-canvas p-4">
                        <DotMatrix rows={6} cols={32} filled={paidUnits} color={DATA_PALETTE.copper} dotSize={7} gap={5} />
                    </div>

                    <div className="mt-5 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold cc-text-secondary">Avance mensual</span>
                            <span className="font-semibold cc-text-primary">{collectionRate}%</span>
                        </div>
                        <FoldedBar pct={collectionRate} color={DATA_PALETTE.copper} orientation="horizontal" thickness={10} />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-elevated p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-tertiary">Pendientes</p>
                                <p className="mt-1 text-xl font-semibold cc-text-primary">{totalUnits - paidUnits}</p>
                            </div>
                            <div className="rounded-lg bg-elevated p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-tertiary">Riesgo</p>
                                <p className="mt-1 text-xl font-semibold cc-text-primary">{collectionRate >= 90 ? "Bajo" : "Medio"}</p>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <article className="rounded-lg border border-subtle bg-surface p-5 shadow-sm lg:col-span-2">
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="h-5 w-5 text-slate-500" />
                            <div>
                                <h2 className="text-lg font-semibold cc-text-primary">Evolución de egresos</h2>
                                <p className="text-sm cc-text-secondary">Histórico de 6 meses operativos</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={printFinancialReport}
                            className="rounded-lg border border-subtle px-3 py-2 text-xs font-semibold cc-text-primary transition-colors hover:bg-elevated"
                        >
                            Imprimir PDF
                        </button>
                    </div>
                    <div className="h-80 w-full">
                        <ExpenseAreaChart data={expenseChartData} />
                    </div>
                </article>

                <article className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <PieChart className="h-5 w-5 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary">Distribución</h2>
                            <p className="text-sm cc-text-secondary">Por categoría</p>
                        </div>
                    </div>
                    <div className="min-h-[220px]">
                        <ExpensePieChart data={expenseCategoryData} />
                    </div>
                    <div className="mt-5 space-y-2">
                        {expenseCategoryData.map(item => (
                            <div key={item.name} className="flex items-center justify-between rounded-lg bg-elevated px-3 py-2">
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
                <article className="rounded-lg border border-subtle bg-surface shadow-sm lg:col-span-2">
                    <div className="flex items-center justify-between border-b border-subtle p-5">
                        <div className="flex items-center gap-3">
                            <Activity className="h-5 w-5 text-slate-500" />
                            <h2 className="text-lg font-semibold cc-text-primary">Movimientos recientes</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => scrollToSection("cobranzas")}
                            className="text-sm font-semibold text-brand-600"
                        >
                            Ver registros
                        </button>
                    </div>
                    <div className="divide-y divide-subtle">
                        {recentActivity.map(activity => (
                            <div key={activity.id} className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-elevated/50">
                                <div className="flex items-center gap-4">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${activity.type === "income" ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg"}`}>
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
                    </div>
                </article>

                <aside className="space-y-6">
                    <article className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-success-fg" />
                            <h2 className="text-lg font-semibold cc-text-primary">Estado de cobranza</h2>
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">{collectionRate}%</p>
                        <p className="mt-1 text-sm cc-text-secondary">Recaudación lograda</p>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated">
                            <div className="h-full bg-brand-500" style={{ width: `${collectionRate}%` }} />
                        </div>
                    </article>

                    <article className="rounded-lg border border-warning-border bg-warning-bg p-5">
                        <div className="mb-4 flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-warning-fg" />
                            <h2 className="text-lg font-semibold cc-text-primary">Atención requerida</h2>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                                <span className="text-sm font-semibold cc-text-secondary">Morosos crónicos (+3m)</span>
                                <span className="font-semibold text-danger-fg">4</span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                                <span className="text-sm font-semibold cc-text-secondary">Avisos de corte enviados</span>
                                <span className="font-semibold text-warning-fg">2</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => scrollToSection("cobranzas")}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
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
