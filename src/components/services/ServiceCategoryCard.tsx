"use client";

import Link from "next/link";
import { Wrench, Zap, Key, Eraser, Briefcase } from "lucide-react";

interface ServiceCategoryCardProps {
    category: {
        id: string;
        name: string;
        iconName: 'wrench' | 'zap' | 'key' | 'cleaning' | 'toolbox';
        gradient: string;
        description: string;
        count: number;
    };
}

export function ServiceCategoryCard({ category }: ServiceCategoryCardProps) {
    const Icon = category.iconName === 'wrench' 
        ? Wrench 
        : category.iconName === 'zap' 
        ? Zap 
        : category.iconName === 'key' 
        ? Key
        : category.iconName === 'cleaning'
        ? Eraser
        : Briefcase;

    return (
        <Link href={`/services/${category.id}`}>
            <article className="group relative bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/20 dark:shadow-black/40 border border-white/50 dark:border-slate-700/50 p-8 hover:shadow-2xl hover:border-white/80 dark:hover:border-slate-600 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                {/* Background gradient decoration */}
                <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>

                {/* Content */}
                <div className="relative z-10">
                    {/* Ícono */}
                    <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${category.gradient} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="h-8 w-8 text-white" />
                    </div>

                    {/* Texto */}
                    <h3 className="text-2xl font-bold cc-text-primary mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-cyan-600 transition-all">
                        {category.name}
                    </h3>

                    <p className="cc-text-secondary text-sm mb-4">
                        {category.count} {category.count === 1 ? 'técnico disponible' : 'técnicos disponibles'}
                    </p>

                    {/* Arrow */}
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold text-sm group-hover:gap-3 transition-all">
                        <span>Ver técnicos</span>
                        <svg className="h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            </article>
        </Link>
    );
}
