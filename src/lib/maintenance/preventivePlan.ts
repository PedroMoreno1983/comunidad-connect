/**
 * preventivePlan.ts — Plan de mantención preventiva por tipo de activo.
 *
 * Cálculo puro: recibe activos y tareas de UNA comunidad y devuelve qué tareas
 * crear, cuáles marcar vencidas y qué fechas de próxima mantención fijar.
 * No escribe nada; la tarea del Agent Center aplica el plan solo después de
 * que la administración aprueba el playbook.
 *
 * Reglas:
 *   - Cada activo tiene a lo más UNA tarea abierta (pending/in_progress/overdue).
 *     Esa es la deduplicación: repetir el plan no duplica tareas.
 *   - La próxima fecha sale de next_maintenance; si no hay, de la última
 *     mantención más la frecuencia del tipo; si no hay ninguna, hoy.
 *   - Solo se crean tareas que vencen dentro del horizonte (45 días), para no
 *     llenar la agenda de trabajos lejanos.
 *   - Riesgo alto (assetRisk.ts) adelanta la mantención a 7 días y sube la prioridad.
 *   - La salud del activo solo empeora a "warning" por atraso o riesgo alto; nunca se mejora
 *     ni se marca "critical" automáticamente: eso lo decide una persona.
 */

export type PreventiveFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type MaintenancePriority = 'low' | 'medium' | 'high';
export type AssetHealth = 'optimal' | 'warning' | 'critical';

export interface PreventiveRule {
    frequency: PreventiveFrequency;
    title: string;
    checklist: string;
    priority: MaintenancePriority;
}

export const PREVENTIVE_CATALOG: Record<string, PreventiveRule> = {
    elevator: { frequency: 'monthly', title: 'Mantención mensual de ascensor', checklist: 'Prueba de rescate, frenos, sensores de puerta y registro en el libro de mantención.', priority: 'high' },
    pump: { frequency: 'monthly', title: 'Revisión de sala de bombas', checklist: 'Presión, sellos, ruidos, tablero de control y alternancia de bombas.', priority: 'high' },
    generator: { frequency: 'monthly', title: 'Prueba de grupo electrógeno', checklist: 'Arranque con carga, nivel de combustible, batería y transferencia automática.', priority: 'high' },
    electrical: { frequency: 'quarterly', title: 'Revisión de tableros eléctricos', checklist: 'Térmicos, diferenciales, rotulado y puntos calientes.', priority: 'medium' },
    fire: { frequency: 'semiannual', title: 'Revisión de red contra incendio', checklist: 'Red húmeda y seca, gabinetes, señalética y luces de emergencia.', priority: 'high' },
    extinguisher: { frequency: 'annual', title: 'Recarga y certificación de extintores', checklist: 'Carga, presión, sello, fecha de vencimiento y ubicación señalizada.', priority: 'high' },
    gate: { frequency: 'quarterly', title: 'Mantención de portones', checklist: 'Motor, finales de carrera, fotoceldas, controles y lubricación.', priority: 'medium' },
    boiler: { frequency: 'semiannual', title: 'Mantención de calderas', checklist: 'Quemador, combustión, válvulas de seguridad y sello de gas.', priority: 'high' },
    hvac: { frequency: 'quarterly', title: 'Mantención de climatización', checklist: 'Filtros, drenajes, refrigerante y ruidos.', priority: 'medium' },
    other: { frequency: 'semiannual', title: 'Inspección preventiva', checklist: 'Estado general, limpieza y registro de observaciones.', priority: 'low' },
};

const CATEGORY_ALIASES: Record<string, string> = {
    ascensor: 'elevator', lift: 'elevator', bomba: 'pump', bombas: 'pump', generador: 'generator',
    electrico: 'electrical', eléctrico: 'electrical', incendio: 'fire', extintor: 'extinguisher', extintores: 'extinguisher',
    porton: 'gate', portón: 'gate', portones: 'gate', caldera: 'boiler', calderas: 'boiler', climatizacion: 'hvac', climatización: 'hvac',
};

const MONTHS: Record<PreventiveFrequency, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
export const PREVENTIVE_HORIZON_DAYS = 45;
/** Un activo de riesgo alto se revisa dentro de esta ventana aunque su fecha sea posterior. */
export const HIGH_RISK_WINDOW_DAYS = 7;
export const OVERDUE_WARNING_DAYS = 30;
const OPEN_STATUSES = new Set(['pending', 'in_progress', 'overdue']);

export function preventiveRuleFor(category: string | null | undefined): PreventiveRule {
    const key = String(category || '').trim().toLowerCase();
    return PREVENTIVE_CATALOG[key] || PREVENTIVE_CATALOG[CATEGORY_ALIASES[key] || ''] || PREVENTIVE_CATALOG.other;
}

/** Suma meses a una fecha AAAA-MM-DD, ajustando al último día del mes si hace falta. */
export function addFrequency(date: string, frequency: PreventiveFrequency): string {
    const [year, month, day] = date.slice(0, 10).split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 + MONTHS[frequency], 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
    return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export interface PlanAsset {
    id: string;
    name: string;
    category: string | null;
    health_status: AssetHealth | string | null;
    last_maintenance: string | null;
    next_maintenance: string | null;
}

export interface PlanTask {
    id: string;
    asset_id: string | null;
    status: string;
    due_date: string;
}

export interface PlannedTask {
    assetId: string;
    assetName: string;
    title: string;
    description: string;
    frequency: PreventiveFrequency;
    dueDate: string;
    priority: MaintenancePriority;
    catchUp: boolean;
    /** Adelantada por riesgo alto (mantención predictiva). */
    riskAdvanced?: boolean;
}

export interface AssetUpdate {
    assetId: string;
    nextMaintenance?: string;
    healthStatus?: AssetHealth;
}

export interface PreventivePlan {
    newTasks: PlannedTask[];
    overdueTaskIds: string[];
    assetUpdates: AssetUpdate[];
    scheduledLater: number;
}

function addDays(date: string, amount: number) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
}

export function planPreventiveMaintenance(input: {
    assets: PlanAsset[];
    tasks: PlanTask[];
    today: string;
    /** Nivel de riesgo por activo (assetRisk.ts). Riesgo alto adelanta la mantención. */
    riskLevels?: Map<string, 'low' | 'medium' | 'high'>;
}): PreventivePlan {
    const today = input.today.slice(0, 10);
    const openByAsset = new Map<string, PlanTask[]>();
    const overdueTaskIds: string[] = [];
    for (const task of input.tasks) {
        if (!OPEN_STATUSES.has(task.status)) continue;
        if (task.status === 'pending' && task.due_date.slice(0, 10) < today) overdueTaskIds.push(task.id);
        if (!task.asset_id) continue;
        openByAsset.set(task.asset_id, [...(openByAsset.get(task.asset_id) || []), task]);
    }

    const newTasks: PlannedTask[] = [];
    const assetUpdates: AssetUpdate[] = [];
    let scheduledLater = 0;

    for (const asset of [...input.assets].sort((a, b) => a.name.localeCompare(b.name))) {
        const rule = preventiveRuleFor(asset.category);
        const open = openByAsset.get(asset.id) || [];
        const update: AssetUpdate = { assetId: asset.id };

        // Atraso: la tarea abierta más antigua, o la fecha prevista ya pasada.
        const oldestOpenDue = open.map(task => task.due_date.slice(0, 10)).sort()[0];
        const planned = asset.next_maintenance?.slice(0, 10)
            || (asset.last_maintenance ? addFrequency(asset.last_maintenance, rule.frequency) : today);
        const lateBy = Math.max(oldestOpenDue ? daysBetween(oldestOpenDue, today) : 0, open.length ? 0 : daysBetween(planned, today));
        const highRisk = input.riskLevels?.get(asset.id) === 'high';
        if ((lateBy > OVERDUE_WARNING_DAYS || highRisk) && (asset.health_status || 'optimal') === 'optimal') update.healthStatus = 'warning';

        if (!open.length) {
            const catchUp = planned < today;
            const riskDate = addDays(today, HIGH_RISK_WINDOW_DAYS);
            const riskAdvanced = highRisk && !catchUp && planned > riskDate;
            const dueDate = catchUp ? today : riskAdvanced ? riskDate : planned;
            if (daysBetween(today, dueDate) <= PREVENTIVE_HORIZON_DAYS) {
                newTasks.push({
                    assetId: asset.id, assetName: asset.name, title: `${rule.title}: ${asset.name}`,
                    description: rule.checklist, frequency: rule.frequency, dueDate,
                    priority: catchUp || highRisk ? 'high' : rule.priority, catchUp,
                    ...(riskAdvanced ? { riskAdvanced: true, description: `${rule.checklist} Adelantada por riesgo alto de falla.` } : {}),
                });
            } else {
                scheduledLater += 1;
            }
            if (asset.next_maintenance?.slice(0, 10) !== dueDate) update.nextMaintenance = dueDate;
        }
        if (update.nextMaintenance || update.healthStatus) assetUpdates.push(update);
    }

    return { newTasks, overdueTaskIds, assetUpdates, scheduledLater };
}
