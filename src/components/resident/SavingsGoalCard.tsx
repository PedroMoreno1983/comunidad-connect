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
        <section className="relative overflow-hidden rounded-2xl p-8 text-white" style={{ background: "var(--cc-ink)" }}>
            <div className="absolute right-0 top-0 p-8 opacity-10">
                <Target className="h-40 w-40" style={{ color: "var(--cc-copper-tint)" }} />
            </div>

            <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="rounded-full p-3" style={{ background: "rgba(156, 86, 54, 0.2)", color: "var(--cc-copper-tint)" }}>
                        <Target className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "var(--cc-font-display)" }}>Meta de ahorro</h2>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cc-ink-tertiary)" }}>Desafío mensual</p>
                    </div>
                </div>

                {!isGoalSet ? (
                    <div className="space-y-4">
                        <p className="text-sm font-medium" style={{ color: "var(--cc-ink-muted)" }}>
                            Define una meta de reducción respecto al mes anterior ({baseline.toFixed(1)} m³).
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {[5, 10, 15].map(percent => (
                                <button
                                    key={percent}
                                    type="button"
                                    onClick={() => setGoalPercentage(percent)}
                                    className="rounded-xl border px-4 py-3 text-center transition-all hover:border-[var(--cc-copper)] hover:bg-[var(--cc-copper)]"
                                    style={{ borderColor: "rgba(255,255,255,0.12)" }}
                                >
                                    <span className="block text-2xl font-semibold text-white transition-transform">{percent}%</span>
                                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--cc-ink-tertiary)" }}>Menos</span>
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
                                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--cc-ink-tertiary)" }}>Meta de consumo</p>
                                <p className="flex items-center gap-2 text-2xl font-semibold text-white" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    {targetConsumption.toFixed(1)} m³
                                    <span className="rounded-full px-2 py-1 text-xs font-bold" style={{ background: "rgba(169, 188, 147, 0.2)", color: "var(--cc-sage)" }}>
                                        -{goalPercentage}%
                                    </span>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setGoalPercentage(null)}
                                className="text-xs font-bold transition-colors hover:text-white"
                                style={{ color: "var(--cc-ink-tertiary)" }}
                            >
                                Cambiar
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cc-ink-tertiary)" }}>
                                <span>Progreso</span>
                                <span>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="h-4 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(progress, 100)}%` }}
                                    className="h-full rounded-full"
                                    style={{ background: progress > 100 ? "var(--cc-rose)" : progress > 80 ? "var(--cc-amber)" : "var(--cc-sage)" }}
                                />
                            </div>
                            <p className="pt-1 text-xs font-medium" style={{ color: "var(--cc-ink-tertiary)" }}>
                                {progress > 100
                                    ? "Has excedido tu meta mensual."
                                    : `Llevas ${currentConsumption.toFixed(1)} m³ consumidos. Vas bien.`}
                            </p>
                        </div>

                        {isOnTrack && (
                            <div className="flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: "rgba(169, 188, 147, 0.3)", background: "rgba(169, 188, 147, 0.1)" }}>
                                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "var(--cc-sage)" }} />
                                <p className="text-xs font-bold" style={{ color: "var(--cc-sage)" }}>
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
