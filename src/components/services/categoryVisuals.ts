import { Hammer, Key, Sparkles, Wrench, Zap, type LucideIcon } from "lucide-react";

export interface CategoryVisual {
    label: string;
    /** Gradiente principal (portada, avatar) */
    gradient: string;
    /** Tinte suave para chips y fondos */
    soft: string;
    /** Color de acento para texto/iconos */
    accent: string;
    Icon: LucideIcon;
}

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
    plumbing: {
        label: "Gasfitería",
        gradient: "linear-gradient(135deg, #0284C7 0%, #0369A1 45%, #0C4A6E 100%)",
        soft: "rgba(2, 132, 199, 0.10)",
        accent: "#0369A1",
        Icon: Wrench,
    },
    electrical: {
        label: "Electricidad",
        gradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 45%, #92400E 100%)",
        soft: "rgba(217, 119, 6, 0.12)",
        accent: "#B45309",
        Icon: Zap,
    },
    locksmith: {
        label: "Cerrajería",
        gradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 45%, #4C1D95 100%)",
        soft: "rgba(124, 58, 237, 0.10)",
        accent: "#6D28D9",
        Icon: Key,
    },
    cleaning: {
        label: "Limpieza",
        gradient: "linear-gradient(135deg, #10B981 0%, #059669 45%, #065F46 100%)",
        soft: "rgba(5, 150, 105, 0.10)",
        accent: "#047857",
        Icon: Sparkles,
    },
    general: {
        label: "Multiservicios",
        gradient: "linear-gradient(135deg, #C99572 0%, #9C5636 45%, #733D24 100%)",
        soft: "rgba(156, 86, 54, 0.10)",
        accent: "#9C5636",
        Icon: Hammer,
    },
};

const FALLBACK: CategoryVisual = CATEGORY_VISUALS.general;

export function getCategoryVisual(category: string): CategoryVisual {
    return CATEGORY_VISUALS[category] ?? { ...FALLBACK, label: category };
}
