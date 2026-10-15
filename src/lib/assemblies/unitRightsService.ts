import 'server-only';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { permilleFromAmounts, rightsLockMessage, sourceNoteOf, unitRightsStatus, validateUnitRights } from './unitRights';
import type { ExpenseProrateSource, UnitRightsMethod, UnitRightsRevision, UnitRightsRevisionValue, UnitRightsStatus, UnitRightsUnit, UnitRightsView } from './types';

/**
 * Derechos de cada unidad (‰): lecturas y escrituras del servidor (service_role).
 * Las cargas pasan por la función `save_unit_rights` de la migración
 * 20261015020000, que valida de nuevo (todas las unidades, 1000‰ ± 0,5, sin
 * votación abierta) y deja la revisión auditable en la misma transacción.
 * Solo administración. Los clientes ya no escriben `units.share_permille`.
 */

export class UnitRightsError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
        this.name = 'UnitRightsError';
    }
}

export interface UnitRightsActor {
    id: string;
    role: 'admin' | 'resident' | 'concierge';
    communityId: string;
    name: string | null;
}

type Row = Record<string, unknown>;
const db = () => getSupabaseAdmin();
const str = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const numOrNull = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));

async function check<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    const { data, error } = await promise;
    if (error) {
        const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
        if (/^Derechos:|votación abierta/.test(message)) throw new UnitRightsError(message.replace(/^Derechos:\s*/, ''), /votación abierta/.test(message) ? 409 : 422);
        throw error;
    }
    return data;
}

function requireAdmin(actor: UnitRightsActor) {
    if (actor.role !== 'admin') throw new UnitRightsError('Solo administración puede cargar los derechos de las unidades.', 403);
}

function labelOf(row: Row) {
    const tower = str(row.tower);
    return tower && tower !== 'A' ? `${tower}-${str(row.number)}` : str(row.number);
}

async function loadUnits(communityId: string): Promise<UnitRightsUnit[]> {
    const rows = await check(db().from('units').select('id, number, tower, share_permille')
        .eq('community_id', communityId).order('number', { ascending: true }).limit(5000));
    return ((rows ?? []) as Row[]).map(row => ({
        id: str(row.id), label: labelOf(row), number: str(row.number), tower: str(row.tower), sharePermille: numOrNull(row.share_permille),
    }));
}

function mapValues(raw: unknown): UnitRightsRevisionValue[] {
    return (Array.isArray(raw) ? raw : []).map(item => {
        const row = (item && typeof item === 'object' ? item : {}) as Row;
        return { unitId: str(row.unit_id), label: str(row.label), permille: numOrNull(row.permille) };
    });
}

function mapRevision(row: Row): UnitRightsRevision {
    return {
        id: str(row.id), method: str(row.method) as UnitRightsMethod, verified: row.verified === true, sourceNote: str(row.source_note),
        savedByName: str(row.saved_by_name), savedAt: str(row.saved_at), total: numOrNull(row.total_permille), unitsCount: Number(row.units_count) || 0,
        previousValues: mapValues(row.previous_values), newValues: mapValues(row.new_values),
    };
}

async function loadRevisions(communityId: string, limit = 20): Promise<UnitRightsRevision[]> {
    const rows = await check(db().from('unit_rights_revisions')
        .select('id, method, verified, source_note, saved_by_name, saved_at, total_permille, units_count, previous_values, new_values')
        .eq('community_id', communityId).order('saved_at', { ascending: false }).limit(limit));
    return ((rows ?? []) as Row[]).map(mapRevision);
}

/** Título de la asamblea en curso con una votación abierta, o null. */
export async function openVoteTitle(communityId: string): Promise<string | null> {
    const assemblies = await check(db().from('assemblies').select('id, title').eq('community_id', communityId).eq('status', 'in_progress'));
    for (const assembly of (assemblies ?? []) as Row[]) {
        const open = await check(db().from('assembly_agenda_items').select('id').eq('assembly_id', str(assembly.id)).eq('voting_status', 'open').limit(1));
        if (((open ?? []) as Row[]).length) return str(assembly.title) || 'en curso';
    }
    return null;
}

/** Estado de los derechos de la comunidad (para marcar la foto de una asamblea). */
export async function unitRightsStatusFor(communityId: string): Promise<UnitRightsStatus> {
    const [units, revisions] = await Promise.all([loadUnits(communityId), loadRevisions(communityId, 1)]);
    return unitRightsStatus(units, revisions[0] ?? null);
}

/**
 * Prorrateo de gastos comunes como punto de partida: el último cobro emitido
 * que se repartió por alícuota (sin caer a partes iguales y sin gastos con
 * método "equal"), con monto para todas las unidades. Se excluye el agua (va
 * por consumo). Si no hay uno así, null: el botón no se muestra.
 */
export async function loadExpenseProrate(communityId: string, units: UnitRightsUnit[]): Promise<ExpenseProrateSource | null> {
    if (units.length === 0) return null;
    const runs = await check(db().from('billing_runs').select('id, month, status, fallback_equal_split')
        .eq('community_id', communityId).neq('status', 'cancelled').eq('fallback_equal_split', false)
        .order('issued_at', { ascending: false }).limit(3));
    for (const run of (runs ?? []) as Row[]) {
        const month = str(run.month);
        const sources = await check(db().from('community_expenses').select('category, prorate_method').eq('community_id', communityId).eq('month', month));
        const shared = ((sources ?? []) as Row[]).filter(row => str(row.category) !== 'water' && str(row.prorate_method) !== 'consumption');
        if (!shared.length || shared.some(row => str(row.prorate_method) !== 'share')) continue;
        const expenses = await check(db().from('expenses').select('id, unit_id, amount').eq('billing_run_id', str(run.id)));
        const expenseRows = (expenses ?? []) as Row[];
        if (!expenseRows.length) continue;
        const items = await check(db().from('expense_items').select('expense_id, category, amount').in('expense_id', expenseRows.map(row => str(row.id))));
        const itemRows = (items ?? []) as Row[];
        const amounts: Record<string, number> = {};
        for (const expense of expenseRows) {
            const own = itemRows.filter(item => str(item.expense_id) === str(expense.id));
            const amount = own.length
                ? own.filter(item => str(item.category) !== 'water').reduce((sum, item) => sum + Number(item.amount || 0), 0)
                : Number(expense.amount || 0);
            amounts[str(expense.unit_id)] = (amounts[str(expense.unit_id)] ?? 0) + amount;
        }
        const values = permilleFromAmounts(amounts, units.map(unit => unit.id));
        if (values) return { month, billingRunId: str(run.id), values };
    }
    return null;
}

export async function getUnitRightsView(actor: UnitRightsActor): Promise<UnitRightsView> {
    requireAdmin(actor);
    const units = await loadUnits(actor.communityId);
    const [revisions, lockedBy, expenseProrate] = await Promise.all([
        loadRevisions(actor.communityId), openVoteTitle(actor.communityId), loadExpenseProrate(actor.communityId, units),
    ]);
    const latest = revisions[0] ?? null;
    const total = Math.round(units.reduce((sum, unit) => sum + (unit.sharePermille ?? 0), 0) * 10_000) / 10_000;
    return { units, total, status: unitRightsStatus(units, latest), lockedBy, latest, revisions, expenseProrate };
}

export interface SaveUnitRightsInput {
    values: Record<string, number | null>;
    method: Extract<UnitRightsMethod, 'manual' | 'csv' | 'expense_prorate'>;
    sourceNote: string;
}

async function callSave(actor: UnitRightsActor, method: UnitRightsMethod, values: { unit_id: string; permille: number }[], sourceNote: string) {
    const revision = await check(db().rpc('save_unit_rights', {
        p_community_id: actor.communityId, p_values: values, p_method: method, p_source_note: sourceNote,
        p_saved_by: actor.id, p_saved_by_name: (actor.name || 'Administración').slice(0, 160),
    }));
    return mapRevision((revision ?? {}) as Row);
}

export async function saveUnitRights(actor: UnitRightsActor, input: SaveUnitRightsInput): Promise<UnitRightsView> {
    requireAdmin(actor);
    const units = await loadUnits(actor.communityId);
    const validation = validateUnitRights(units, input.values);
    if (!validation.ok) throw new UnitRightsError(validation.errors.join(' '), 422);
    const lock = rightsLockMessage(await openVoteTitle(actor.communityId));
    if (lock) throw new UnitRightsError(lock, 409);
    // Lo precargado del prorrateo de gastos comunes siempre entra como provisorio.
    const sourceNote = input.method === 'expense_prorate' ? '' : sourceNoteOf(input.sourceNote);
    const revision = await callSave(actor, input.method, units.map(unit => ({ unit_id: unit.id, permille: Number(input.values[unit.id]) })), sourceNote);
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.unit_rights_saved', entityType: 'unit_rights',
        entityId: revision.id || undefined, severity: revision.verified ? 'info' : 'warning', status: 'success',
        summary: revision.verified ? 'Derechos de las unidades cargados con fuente' : 'Derechos de las unidades cargados como provisorios',
        metadata: { method: input.method, units: units.length, verified: revision.verified },
    });
    return getUnitRightsView(actor);
}

/** Registra la fuente (reglamento, escritura) de los derechos vigentes, sin cambiar valores. */
export async function verifyUnitRights(actor: UnitRightsActor, rawSourceNote: string): Promise<UnitRightsView> {
    requireAdmin(actor);
    const sourceNote = sourceNoteOf(rawSourceNote);
    if (!sourceNote) throw new UnitRightsError('Indica la fuente: por ejemplo, "Reglamento de copropiedad, art. 5 / escritura".', 422);
    const lock = rightsLockMessage(await openVoteTitle(actor.communityId));
    if (lock) throw new UnitRightsError(lock, 409);
    const revision = await callSave(actor, 'verify', [], sourceNote);
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.unit_rights_verified', entityType: 'unit_rights',
        entityId: revision.id || undefined, severity: 'info', status: 'success', summary: 'Fuente de los derechos registrada',
        metadata: { units: revision.unitsCount },
    });
    return getUnitRightsView(actor);
}
