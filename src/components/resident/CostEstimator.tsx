"use client";

import { Calculator, HelpCircle } from "lucide-react";

interface CostEstimatorProps {
    consumption: number; // m3
}

export function CostEstimator({ consumption }: CostEstimatorProps) {
    // Tarifas Mock (CLP)
    const FIXED_CHARGE = 1200; // Cargo fijo
    const VARIABLE_RATE = 850; // valor por m3
    const SEWER_RATE = 600; // alcantarillado por m3

    const waterCost = consumption * VARIABLE_RATE;
    const sewerCost = consumption * SEWER_RATE;
    const totalEstimated = FIXED_CHARGE + waterCost + sewerCost;

    return (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-6 relative overflow-hidden">

            {/* Background Decor */}
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Calculator className="h-32 w-32 text-slate-900 dark:text-white" />
            </div>

            <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600">
                    <Calculator className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white">Estimación de Costo</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Basado en consumo actual</p>
                </div>
            </div>

            <div className="space-y-4 relative z-10">
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-slate-900 dark:text-white">
                        ${totalEstimated.toLocaleString('es-CL')}
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">CLP Aprox.</span>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-50 dark:border-slate-800">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Cargo Fijo</span>
                        <span className="text-slate-900 dark:text-white font-bold">${FIXED_CHARGE.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Agua Potable ({consumption} m³)</span>
                        <span className="text-slate-900 dark:text-white font-bold">${waterCost.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Alcantarillado</span>
                        <span className="text-slate-900 dark:text-white font-bold">${sewerCost.toLocaleString('es-CL')}</span>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex gap-3">
                    <HelpCircle className="h-5 w-5 text-slate-400 shrink-0" />
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Este valor es referencial y puede variar según las tarifas vigentes de la empresa sanitaria y prorrateos de áreas comunes.
                    </p>
                </div>
            </div>
        </div>
    );
}
