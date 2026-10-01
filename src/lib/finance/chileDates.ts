const CHILE_TIME_ZONE = "America/Santiago";

/** Calendar dates in finance are Chilean civil dates, not UTC instants. */
export function todayInChile(now = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: CHILE_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const value = (part: "year" | "month" | "day") => parts.find(item => item.type === part)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
}

export function currentMonthInChile(now = new Date()): string {
    return todayInChile(now).slice(0, 7);
}

export function nextMonthFifthInChile(now = new Date()): string {
    const [year, month] = currentMonthInChile(now).split("-").map(Number);
    return new Date(Date.UTC(year, month, 5)).toISOString().slice(0, 10);
}

export function formatFinanceDate(date: string): string {
    return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
    });
}
