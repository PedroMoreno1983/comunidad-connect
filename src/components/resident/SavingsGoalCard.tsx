"use client";

import { useState } from "react";
import { Target, TrendingDown, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

interface SavingsGoalCardProps {
    currentConsumption: number;
    lastMonthConsumption: number;
}

export function SavingsGoalCard({ currentConsumption, lastMonthConsumption }: SavingsGoalCardProps) {
    const [goalPercentage, setGoalPercentage] = useState<number | null>(null);
    const [isGoalSet, setIsGoalSet] = useState(false);

    const handleSetGoal = (percentage: number) => {
        setGoalPercentage(percentage);
        setIsGoalSet(true);
    };

    const targetConsumption = goalPercentage
        ? lastMonthConsumption * (1 - goalPercentage / 100)
        : lastMonthConsumption;

    const progress = Math.min(100, (currentConsumption / targetConsumption) * 100);
    const isOnTrack = currentConsumption <= targetConsumption;

    return (
        <div className="bg-canvas p-8 rounded-[2.5rem] text-white relative overflow-hidden">
            {/* Background */}
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <Target className="h-40 w-40 text-blue-500" />
            </div>

            <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-400">
                        <Target className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white">Meta de Ahorro</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Desafío Mensual</p>
                    </div>
                </div>

                {!isGoalSet ? (
                    <div className="space-y-4">
                        <p className="text-sm font-medium text-slate-300">
                            Propóngase una meta de reducción respecto al mes anterior ({lastMonthConsumption} m³).
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {[5, 10, 15].map((percent) => (
                                <button
                                    key={percent}
                                    onClick={() => handleSetGoal(percent)}
                                    className="py-3 px-4 rounded-xl border border-slate-700 hover:bg-blue-600 hover:border-blue-500 transition-all text-center group"
                                >
                                    <span className="block text-2xl font-black text-white group-hover:scale-110 transition-transform">{percent}%</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-blue-200">Menos</span>
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
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meta de Consumo</p>
                                <p className="text-2xl font-black text-white flex items-center gap-2">
                                    {targetConsumption.toFixed(1)} m³
                                    <span className="text-xs font-bold text-emerald-400 px-2 py-1 bg-emerald-500/20 rounded-lg">
                                        -{goalPercentage}%
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => setIsGoalSet(false)}
                                className="text-xs font-bold text-slate-500 hover:text-white transition-colors"
                            >
                                Cambiar
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                                <span>Progreso</span>
                                <span>{progress.toFixed(0)}%</span>
                            </div>
                            <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className={`h-full rounded-full ${progress > 100 ? 'bg-red-500' :
                                            progress > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}
                                />
                            </div>
                            <p className="text-xs font-medium text-slate-400 pt-1">
                                {progress > 100
                                    ? "Has excedido tu meta mensual."
                                    : `Llevas ${currentConsumption} m³ consumidos. ¡Vas bien!`}
                            </p>
                        </div>

                        {isOnTrack && (
                            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                <p className="text-xs font-bold text-emerald-400">
                                    Estás en camino a cumplir tu meta. ¡Sigue así!
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
