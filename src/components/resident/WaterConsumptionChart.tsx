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
            <div className="rounded-lg border border-subtle bg-elevated/50 p-8 text-center">
                <p className="text-slate-500">No hay datos de consumo registrados aún.</p>
            </div>
        );
    }

    const currentMonth = data[data.length - 1];
    const isEfficient = currentMonth.personal <= currentMonth.average;
    const diffPercentage = currentMonth.average > 0
        ? Math.round(Math.abs((currentMonth.personal - currentMonth.average) / currentMonth.average) * 100)
        : 0;

    return (
        <div className="space-y-8">
            <section className={`rounded-lg border p-8 transition-all ${
                isEfficient
                    ? "border-emerald-100 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                    : "border-amber-100 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5"
            }`}>
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                    <div className="flex items-center gap-6">
                        <div className={`rounded-2xl p-5 text-white ${isEfficient ? "bg-emerald-500" : "bg-amber-500"}`}>
                            {isEfficient ? <TrendingDown className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-2xl font-semibold leading-tight cc-text-primary">
                                {isEfficient ? "Consumo eficiente" : "Consumo elevado"}
                            </h2>
                            <p className="text-sm font-medium text-slate-500">
                                {isEfficient
                                    ? `Estás consumiendo un ${diffPercentage}% menos que el promedio del edificio.`
                                    : `Estás consumiendo un ${diffPercentage}% más que el promedio del edificio.`}
                            </p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-subtle bg-surface px-6 py-4 shadow-sm">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Tu consumo actual</p>
                        <p className="text-2xl font-semibold cc-text-primary">{currentMonth.personal} m³</p>
                    </div>
                </div>
            </section>

            <section className="space-y-10 rounded-lg border border-subtle bg-surface p-8 shadow-sm shadow-slate-200/20 dark:shadow-none md:p-12">
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                        <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                            <Droplets className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary">Tendencia histórica</h2>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-blue-500" />
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Personal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-elevated" />
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Promedio</span>
                        </div>
                    </div>
                </div>

                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
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
                                        <div className="space-y-4 rounded-2xl border border-white/10 bg-canvas p-6 text-white shadow-sm">
                                            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{payload[0].payload.month}</p>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-8">
                                                    <span className="text-xs font-bold text-slate-400">Personal</span>
                                                    <span className="text-lg font-semibold text-blue-400">{payload[0].value} m³</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-8">
                                                    <span className="text-xs font-bold text-slate-400">Promedio</span>
                                                    <span className="text-lg font-semibold text-white">{payload[1].value} m³</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="personal" radius={[8, 8, 0, 0]} barSize={40}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${entry.month}-${index}`} fill={index === data.length - 1 ? "#3b82f6" : "#94a3b833"} />
                                ))}
                            </Bar>
                            <Bar dataKey="average" fill="#cbd5e144" radius={[8, 8, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="flex items-start gap-4 rounded-2xl border border-subtle bg-elevated/50 p-6">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                    <p className="text-xs font-medium leading-relaxed text-slate-500">
                        Los consumos se calculan en base a la lectura del remarcador individual. El promedio sirve como referencia para detectar desviaciones o posibles fugas.
                    </p>
                </div>
            </section>
        </div>
    );
}
