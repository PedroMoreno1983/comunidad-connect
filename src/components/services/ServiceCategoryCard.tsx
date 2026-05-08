"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, Eraser, Key, Wrench, Zap } from "lucide-react";

interface ServiceCategoryCardProps {
    category: {
        id: string;
        name: string;
        iconName: "wrench" | "zap" | "key" | "cleaning" | "toolbox";
        gradient: string;
        description: string;
        count: number;
    };
}

export function ServiceCategoryCard({ category }: ServiceCategoryCardProps) {
    const Icon = category.iconName === "wrench"
        ? Wrench
        : category.iconName === "zap"
        ? Zap
        : category.iconName === "key"
        ? Key
        : category.iconName === "cleaning"
        ? Eraser
        : Briefcase;

    return (
        <Link href={`/services/${category.id}`} className="block h-full">
            <article className="group flex h-full flex-col rounded-lg border border-subtle bg-surface p-5 shadow-sm transition-colors hover:border-brand-200">
                <div className="mb-4 inline-flex w-fit rounded-lg bg-brand-50 p-3 text-brand-600">
                    <Icon className="h-6 w-6" />
                </div>

                <h3 className="mb-2 text-lg font-bold cc-text-primary transition-colors group-hover:text-brand-600">
                    {category.name}
                </h3>

                <p className="mb-3 text-sm leading-6 cc-text-secondary">
                    {category.description}
                </p>

                <p className="mb-5 text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">
                    {category.count} {category.count === 1 ? "tecnico disponible" : "tecnicos disponibles"}
                </p>

                <div className="mt-auto flex items-center gap-2 text-sm font-semibold text-brand-600">
                    <span>Ver tecnicos</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
            </article>
        </Link>
    );
}
