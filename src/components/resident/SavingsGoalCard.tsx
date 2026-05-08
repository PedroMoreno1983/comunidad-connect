"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Target } from "lucide-react";

interface SavingsGoalCardProps {
    currentConsumption: number;
    lastMonthConsumption: number;
}

export function SavingsGoalCard({ currentConsumption, lastMonthConsumption }: SavingsGoalCardProps) {
    const [goalPercentage, setGoalPercentage] = useState<number | null>(null);

    const baseline = lastMonthConsumption > 0 ? lastMonthConsumption : Math.max(currentConsumption, 10);
    const targetConsumption = useMemo(() => {
        if (!goalPercentage) return baseline;
        return baseline * (1 - goalPercentage / 100);
    }, [baseline, goalPercentage]);

    const progress = targetConsumption > 0 ? Math.min(140, (currentConsumption / targetConsumption) * 100) : 0;
    const isGoalSet = goalPercentage !== null;
    const isOnTrack = currentConsumption <= targetConsumption;

    return (
        <section className="relative overflow-hidden rounded-lg bg-canvas p-8 text-white">
            <div className="absolute right-0 top-0 p-8 opacity-10">
                <Target className="h-40 w-40 text-blue-500" />
            </div>

            <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-blue-500/20 p-3 text-blue-400">
                        <Target className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white">Meta de ahorro</h2>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Desafío mensual</p>
                    </div>
                </div>

                {!isGoalSet ? (
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-slate-300">
                            Define una meta de reducción respecto al mes anterior ({baseline.toFixed(1)} m³).
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {[5, 10, 15].map(percent => (
                                <button
                                    key={percent}
                                    type="button"
                                    onClick={() => setGoalPercentage(percent)}
                                    className="rounded-xl border border-slate-700 px-4 py-3 text-center transition-all hover:border-blue-500 hover:bg-blue-600"
                                >
                                    <span className="block text-2xl font-semibold text-white transition-transform">{percent}%</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Menos</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Meta de consumo</p>
                                <p className="flex items-center gap-2 text-2xl font-semibold text-white">
                                    {targetConsumption.toFixed(1)} m³
                                    <span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-400">
                                        -{goalPercentage}%
                                    </span>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setGoalPercentage(null)}
                                className="text-xs font-bold text-slate-500 transition-colors hover:text-white"
                            >
                                Cambiar
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                                <span>Progreso</span>
                                <span>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(progress, 100)}%` }}
                                    className={`h-full rounded-full ${
                                        progress > 100
                                            ? "bg-red-500"
                                            : progress > 80
                                                ? "bg-amber-500"
                                                : "bg-emerald-500"
                                    }`}
                                />
                            </div>
                            <p className="pt-1 text-xs font-medium text-slate-400">
                                {progress > 100
                                    ? "Has excedido tu meta mensual."
                                    : `Llevas ${currentConsumption.toFixed(1)} m³ consumidos. Vas bien.`}
                            </p>
                        </div>

                        {isOnTrack && (
                            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                                <p className="text-xs font-bold text-emerald-400">
                                    Estás en camino a cumplir tu meta. Sigue así.
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </section>
    );
}
