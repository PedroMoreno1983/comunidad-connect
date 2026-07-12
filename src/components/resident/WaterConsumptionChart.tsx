import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { Droplets, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { ConsumptionMetric } from "@/lib/types";

interface WaterConsumptionChartProps {
    data: ConsumptionMetric[];
}

export function WaterConsumptionChart({ data }: WaterConsumptionChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                <p className="cc-text-tertiary">No hay datos de consumo registrados aún.</p>
            </div>
        );
    }

    const currentMonth = data[data.length - 1];
    const isEfficient = currentMonth.personal <= currentMonth.average;
    const diffPercentage = currentMonth.average > 0
        ? Math.round(Math.abs((currentMonth.personal - currentMonth.average) / currentMonth.average) * 100)
        : 0;

    return (
        <div className="space-y-6 md:space-y-8">
            <section className="rounded-2xl border p-5 transition-all md:p-8" style={isEfficient
                ? { borderColor: "var(--cc-success-border)", background: "var(--cc-success-bg)" }
                : { borderColor: "var(--cc-warning-border)", background: "var(--cc-warning-bg)" }}>
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="rounded-full p-4 text-white md:p-5" style={{ background: isEfficient ? "var(--cc-sage)" : "var(--cc-amber)" }}>
                            {isEfficient ? <TrendingDown className="h-6 w-6 md:h-8 md:w-8" /> : <AlertTriangle className="h-6 w-6 md:h-8 md:w-8" />}
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-xl font-semibold leading-tight cc-text-primary md:text-2xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                                {isEfficient ? "Consumo eficiente" : "Consumo elevado"}
                            </h2>
                            <p className="text-sm font-medium cc-text-secondary">
                                {isEfficient
                                    ? `Estás consumiendo un ${diffPercentage}% menos que el promedio del edificio.`
                                    : `Estás consumiendo un ${diffPercentage}% más que el promedio del edificio.`}
                            </p>
                        </div>
                    </div>
                    <div className="rounded-2xl border px-6 py-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">Tu consumo actual</p>
                        <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{currentMonth.personal} m³</p>
                    </div>
                </div>
            </section>

            <section className="space-y-8 rounded-2xl border p-5 md:space-y-10 md:p-10" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                        <div className="rounded-full p-3" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                            <Droplets className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Tendencia histórica</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 md:gap-6">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ background: "var(--cc-copper)" }} />
                            <span className="text-xs font-bold uppercase tracking-widest cc-text-tertiary">Personal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ background: "var(--cc-paper-warm)" }} />
                            <span className="text-xs font-bold uppercase tracking-widest cc-text-tertiary">Promedio</span>
                        </div>
                    </div>
                </div>

                <div className="h-[280px] w-full md:h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 20, right: 8, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="#e7e2dd" />
                            <XAxis
                                dataKey="month"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }}
                                dy={15}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }}
                            />
                            <Tooltip
                                cursor={{ fill: "transparent" }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;

                                    return (
                                        <div className="space-y-4 rounded-xl p-6 text-white" style={{ background: "var(--cc-ink)" }}>
                                            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--cc-ink-tertiary)" }}>{payload[0].payload.month}</p>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-8">
                                                    <span className="text-xs font-bold" style={{ color: "var(--cc-ink-tertiary)" }}>Personal</span>
                                                    <span className="text-lg font-semibold" style={{ color: "var(--cc-copper-tint)" }}>{payload[0].value} m³</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-8">
                                                    <span className="text-xs font-bold" style={{ color: "var(--cc-ink-tertiary)" }}>Promedio</span>
                                                    <span className="text-lg font-semibold text-white">{payload[1].value} m³</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="personal" radius={[8, 8, 0, 0]} barSize={28}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${entry.month}-${index}`} fill={index === data.length - 1 ? "#B5664E" : "#94a3b833"} />
                                ))}
                            </Bar>
                            <Bar dataKey="average" fill="#cbd5e166" radius={[8, 8, 0, 0]} barSize={28} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="flex items-start gap-4 rounded-xl border p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <Info className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cc-ink-faint)" }} />
                    <p className="text-xs font-medium leading-relaxed cc-text-tertiary">
                        Los consumos se calculan en base a la lectura del remarcador individual. El promedio sirve como referencia para detectar desviaciones o posibles fugas.
                    </p>
                </div>
            </section>
        </div>
    );
}
