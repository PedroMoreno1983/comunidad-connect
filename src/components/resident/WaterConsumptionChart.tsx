import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, AreaChart, Area
} from 'recharts';
import { motion } from 'framer-motion';
import { Droplets, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { ConsumptionMetric } from '@/lib/types';

interface WaterConsumptionChartProps {
    data: ConsumptionMetric[];
}

export function WaterConsumptionChart({ data }: WaterConsumptionChartProps) {
    // Si no hay datos, mostrar estado vacío
    if (!data || data.length === 0) {
        return (
            <div className="p-8 bg-elevated/50 rounded-[2.5rem] border border-subtle text-center">
                <p className="text-slate-500">No hay datos de consumo registrados aún.</p>
            </div>
        );
    }


    // Calculate efficiency
    const currentMonth = data[data.length - 1];
    const isEfficient = currentMonth.personal < currentMonth.average;
    const diffPercentage = Math.round(Math.abs((currentMonth.personal - currentMonth.average) / currentMonth.average) * 100);

    return (
        <div className="space-y-8">
            {/* Efficiency Highlight Card */}
            <div className={`p-8 rounded-[2.5rem] border transition-all ${isEfficient
                ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-100 dark:border-emerald-500/20'
                : 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-100 dark:border-amber-500/20'
                }`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <div className={`p-5 rounded-2xl ${isEfficient ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                            }`}>
                            {isEfficient ? <TrendingDown className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-2xl font-black cc-text-primary leading-tight">
                                {isEfficient ? 'Consumo Eficiente' : 'Consumo Elevado'}
                            </h3>
                            <p className="text-sm font-medium text-slate-500">
                                {isEfficient
                                    ? `Estás consumiendo un ${diffPercentage}% menos que el promedio de la torre.`
                                    : `Estás consumiendo un ${diffPercentage}% más que el promedio de la torre.`}
                            </p>
                        </div>
                    </div>
                    <div className="px-6 py-4 bg-surface rounded-2xl shadow-sm border border-subtle">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tu Consumo Ene</p>
                        <p className="text-2xl font-black cc-text-primary">{currentMonth.personal} m³</p>
                    </div>
                </div>
            </div>

            {/* Main Chart Container */}
            <div className="bg-surface p-8 md:p-12 rounded-[3rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none space-y-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-400">
                            <Droplets className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-black cc-text-primary">Tendencia Histórica</h2>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-blue-500" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Personal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-elevated" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Promedio Torre</span>
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
                                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                                dy={15}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-canvas text-white p-6 rounded-2xl shadow-2xl border border-white/10 space-y-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{payload[0].payload.month}</p>
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between gap-8">
                                                        <span className="text-xs font-bold text-slate-400">Personal</span>
                                                        <span className="text-lg font-black text-blue-400">{payload[0].value} m³</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-8">
                                                        <span className="text-xs font-bold text-slate-400">Promedio</span>
                                                        <span className="text-lg font-black text-white">{payload[1].value} m³</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="personal" radius={[8, 8, 0, 0]} barSize={40}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === data.length - 1 ? '#3b82f6' : '#94a3b833'} />
                                ))}
                            </Bar>
                            <Bar dataKey="average" fill="#cbd5e144" radius={[8, 8, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend / Info */}
                <div className="p-6 bg-elevated/50 rounded-2xl flex gap-4 items-start border border-subtle">
                    <Info className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-slate-500 leading-relaxed">
                        Los consumos se calculan en base a la lectura de su remarcador individual. El promedio de la torre incluye todas las unidades de su misma tipología (mismos dormitorios/baños).
                    </p>
                </div>
            </div>
        </div>
    );
}
