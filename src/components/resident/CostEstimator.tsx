"use client";

import { Calculator, HelpCircle } from "lucide-react";

interface CostEstimatorProps {
    consumption: number;
}

export function CostEstimator({ consumption }: CostEstimatorProps) {
    const fixedCharge = 1200;
    const variableRate = 850;
    const sewerRate = 600;

    const waterCost = consumption * variableRate;
    const sewerCost = consumption * sewerRate;
    const totalEstimated = fixedCharge + waterCost + sewerCost;

    return (
        <section className="relative space-y-6 overflow-hidden rounded-lg border border-subtle bg-surface p-8 shadow-sm shadow-slate-200/20 dark:shadow-none">
            <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-5">
                <Calculator className="h-32 w-32 cc-text-primary" />
            </div>

            <div className="relative z-10 flex items-center gap-4">
                <div className="rounded-2xl bg-success-bg p-3 text-emerald-600">
                    <Calculator className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold cc-text-primary">Estimación de costo</h2>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Basado en consumo actual</p>
                </div>
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-semibold cc-text-primary">
                        ${Math.round(totalEstimated).toLocaleString("es-CL")}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">CLP aprox.</span>
                </div>

                <div className="space-y-3 border-t border-subtle pt-4">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-500">Cargo fijo</span>
                        <span className="font-bold cc-text-primary">${fixedCharge.toLocaleString("es-CL")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-500">Agua potable ({consumption.toFixed(1)} m³)</span>
                        <span className="font-bold cc-text-primary">${Math.round(waterCost).toLocaleString("es-CL")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-500">Alcantarillado</span>
                        <span className="font-bold cc-text-primary">${Math.round(sewerCost).toLocaleString("es-CL")}</span>
                    </div>
                </div>

                <div className="flex gap-3 rounded-2xl bg-elevated/50 p-4">
                    <HelpCircle className="h-5 w-5 shrink-0 text-slate-400" />
                    <p className="text-xs leading-relaxed text-slate-500">
                        Este valor es referencial y puede variar según las tarifas vigentes de la empresa sanitaria y prorrateos de áreas comunes.
                    </p>
                </div>
            </div>
        </section>
    );
}
