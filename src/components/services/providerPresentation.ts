import type { ServiceProvider } from "@/lib/types";

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
