import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import {
    getUnitRightsView,
    saveUnitRights,
    UnitRightsError,
    verifyUnitRights,
    type SaveUnitRightsInput,
    type UnitRightsActor,
} from '@/lib/assemblies/unitRightsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/assemblies/unit-rights';

async function requireAdminActor(): Promise<UnitRightsActor> {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) throw new UnitRightsError('Inicia sesión.', 401);
    if (!profile.community_id) throw new UnitRightsError('Tu cuenta no está asociada a una comunidad.', 403);
    if (profile.role !== 'admin') throw new UnitRightsError('Solo administración puede cargar los derechos de las unidades.', 403);
    return { id: profile.id, role: 'admin', communityId: profile.community_id, name: profile.name ?? null };
}

function respondError(req: NextRequest, error: unknown) {
    if (error instanceof UnitRightsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiErrorResponse(req, ROUTE, error, { publicMessage: 'No se pudieron guardar los derechos de las unidades.' });
}

function valuesFrom(raw: unknown): Record<string, number | null> {
    const values: Record<string, number | null> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return values;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 5000)) {
        if (!/^[0-9a-f-]{36}$/i.test(key)) continue;
        values[key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    return values;
}

const METHODS: SaveUnitRightsInput['method'][] = ['manual', 'csv', 'expense_prorate'];

/** GET: derechos de cada unidad, estado (faltan / provisorios / verificados), bloqueo e historial. Solo admin. */
export async function GET(req: NextRequest) {
    try {
        return NextResponse.json(await getUnitRightsView(await requireAdminActor()));
    } catch (error) { return respondError(req, error); }
}

/**
 * POST { action: 'save', values: { [unitId]: permille }, method, sourceNote }
 * POST { action: 'verify', sourceNote }
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'assemblies-unit-rights', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const actor = await requireAdminActor();
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const sourceNote = typeof body.sourceNote === 'string' ? body.sourceNote.slice(0, 1000) : '';
        if (body.action === 'save') {
            const method = METHODS.includes(body.method as SaveUnitRightsInput['method']) ? body.method as SaveUnitRightsInput['method'] : 'manual';
            return NextResponse.json(await saveUnitRights(actor, { values: valuesFrom(body.values), method, sourceNote }));
        }
        if (body.action === 'verify') return NextResponse.json(await verifyUnitRights(actor, sourceNote));
        throw new UnitRightsError('Acción no soportada.');
    } catch (error) { return respondError(req, error); }
}
