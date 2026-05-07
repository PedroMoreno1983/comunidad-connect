const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function getCurrentWaterPeriod(date = new Date()) {
    return {
        month: MONTHS[date.getMonth()],
        year: date.getFullYear(),
    };
}
