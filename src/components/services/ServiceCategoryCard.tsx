"use client";

import Link from "next/link";
import { Briefcase, Eraser, Key, Wrench, Zap } from "lucide-react";

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
            <article className="group h-full rounded-lg border border-subtle bg-surface p-5 shadow-sm transition-colors hover:border-brand-200">
                <div className="mb-4 inline-flex rounded-lg bg-brand-50 p-3 text-brand-600">
                    <Icon className="h-6 w-6" />
                </div>

                <h3 className="mb-2 text-lg font-bold cc-text-primary transition-colors group-hover:text-brand-600">
                    {category.name}
                </h3>

                <p className="mb-4 text-sm cc-text-secondary">
                    {category.count} {category.count === 1 ? "técnico disponible" : "técnicos disponibles"}
                </p>

                <div className="flex items-center gap-2 text-sm font-semibold text-brand-600">
                    <span>Ver técnicos</span>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </article>
        </Link>
    );
}
