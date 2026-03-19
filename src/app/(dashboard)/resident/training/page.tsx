"use client";

import { MultiAgentClassroom } from "@/components/training/MultiAgentClassroom";
import { BookOpen } from "lucide-react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function ResidentTrainingPage() {
    return (
        <ErrorBoundary name="Resident Training Module">
            <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex flex-col mb-8">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white border-l-4 border-indigo-500 pl-4 py-1 flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-indigo-500" />
                        Centro de Formación Multi-Agente
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-3 ml-5 max-w-2xl text-sm font-medium">
                        Bienvenido a las aulas interactivas de ComunidadConnect. Aquí podrás capacitarte sobre convivencia, seguridad y normativas junto a "CoCo Tutor" y tus compañeros virtuales.
                    </p>
                </div>

                <div className="w-full h-full">
                    <MultiAgentClassroom />
                </div>
            </div>
        </ErrorBoundary>
    );
}
