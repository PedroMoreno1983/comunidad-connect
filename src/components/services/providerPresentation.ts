import type { ServiceProvider } from "@/lib/types";
import { getCategoryVisual } from "@/components/services/categoryVisuals";

/** 1 columna en móvil estrecho, 2 en móvil ancho y tablet, 3 con sidebar, 4 en pantallas anchas. */
export const providerListingGridClass =
    "grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function providerProfileHref(id: string, contact = false) {
    return contact ? `/services/provider/${id}?contact=1` : `/services/provider/${id}`;
}

export function formatClp(amount: number) {
    return `$${amount.toLocaleString("es-CL")}`;
}

export function providerPrice(provider: ServiceProvider) {
    if (provider.hourlyRate && provider.hourlyRate > 0) {
        return {
            hasRate: true,
            headline: formatClp(provider.hourlyRate),
            caption: "por hora",
        };
    }
    return {
        hasRate: false,
        headline: "A convenir",
        caption: "sin tarifa publicada",
    };
}

export function availabilityCopy(availability: ServiceProvider["availability"]) {
    if (availability === "available") return { label: "Disponible hoy", color: "var(--cc-sage)" };
    if (availability === "busy") return { label: "Agenda ocupada", color: "var(--cc-amber)" };
    return { label: "Sin cupos", color: "var(--cc-rose)" };
}

/** Titular profesional armado con el oficio y la primera especialidad publicada. */
export function providerHeadline(provider: ServiceProvider) {
    const label = getCategoryVisual(provider.category).label;
    const lead = (provider.specialties ?? []).find(item => item.trim().length > 0)?.trim();
    return lead ? `${label} · ${lead}` : label;
}

export function providerChips(provider: ServiceProvider) {
    const chips: string[] = [];
    if (provider.yearsExperience > 0) chips.push(`${provider.yearsExperience} años de experiencia`);
    if (provider.completedJobs > 0) chips.push(`${provider.completedJobs} trabajos realizados`);
    chips.push(availabilityCopy(provider.availability).label);
    return chips;
}

export function whatsappUrl(phone: string) {
    const digits = phone.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
}
