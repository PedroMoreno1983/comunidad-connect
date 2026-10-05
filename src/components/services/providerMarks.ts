import type { ServiceProvider } from "@/lib/types";
import { getInitials } from "@/lib/utils/avatar";

/** Whole years drawn as open dots. The editorial number keeps the stored total. */
export const YEAR_MARK_CAP = 16;
/** Whole jobs drawn as ticks. The editorial number keeps the stored total. */
export const JOB_MARK_CAP = 12;

const CATEGORY_INK: Record<ServiceProvider["category"], string> = {
    plumbing: "var(--cc-ink)",
    electrical: "var(--cc-amber)",
    locksmith: "var(--cc-copper-deep)",
    cleaning: "var(--cc-sage)",
    general: "var(--cc-copper)",
};

export interface ProviderMarks {
    ink: string;
    initials: string;
    /** Open dots actually drawn (capped). Zero means the mark is omitted. */
    yearDots: number;
    /** Stored whole years. Zero means there is no year figure to print. */
    yearTotal: number;
    jobTicks: number;
    jobTotal: number;
    /** Filled dots, 1–5, only when there is at least one review and a rating above zero. */
    ratingDots: number;
    hasResponse: boolean;
    responseLabel: string;
}

function wholeCount(value: number): number {
    if (!Number.isFinite(value) || value < 1) return 0;
    return Math.floor(value);
}

export function categoryInk(category: string): string {
    if (category in CATEGORY_INK) return CATEGORY_INK[category as ServiceProvider["category"]];
    return CATEGORY_INK.general;
}

export function providerMarks(provider: Pick<
    ServiceProvider,
    "name" | "category" | "rating" | "reviewCount" | "yearsExperience" | "completedJobs" | "responseTime"
>): ProviderMarks {
    const yearTotal = wholeCount(provider.yearsExperience);
    const jobTotal = wholeCount(provider.completedJobs);
    const responseLabel = provider.responseTime?.trim() ?? "";
    const ratingDots = provider.reviewCount > 0 && provider.rating > 0
        ? Math.min(5, Math.max(1, Math.round(provider.rating)))
        : 0;

    return {
        ink: categoryInk(provider.category),
        initials: getInitials(provider.name) || "·",
        yearDots: Math.min(yearTotal, YEAR_MARK_CAP),
        yearTotal,
        jobTicks: Math.min(jobTotal, JOB_MARK_CAP),
        jobTotal,
        ratingDots,
        hasResponse: responseLabel.length > 0,
        responseLabel,
    };
}

export function glyphLabel(marks: ProviderMarks): string {
    const parts = ["Glifo del perfil, sin foto inventada"];
    if (marks.yearTotal > 0) parts.push(`${marks.yearTotal} años`);
    if (marks.jobTotal > 0) parts.push(`${marks.jobTotal} trabajos`);
    if (marks.ratingDots > 0) parts.push(`valoración ${marks.ratingDots} de 5`);
    if (marks.hasResponse) parts.push("tiempo de respuesta publicado");
    parts.push(`iniciales ${marks.initials}`);
    return parts.join(". ");
}
