import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { ASSEMBLY_MATTERS } from '@/lib/assemblies/catalog';
import {
    AssemblyError,
    cancelAssembly,
    castVote,
    checkIn,
    closeSession,
    closeVote,
    createAssembly,
    draftCitation,
    getAssemblyView,
    listAssemblies,
    listCommunityResidents,
    markLeft,
    openVote,
    publishCitation,
    recordVote,
    regenerateMinutes,
    registerProxy,
    reviewProxy,
    rsvp,
    saveMinutes,
    signMinutes,
    startSession,
    updateAssemblyDraft,
    verifyAttendance,
    verifyVote,
    type AssemblyActor,
    type AssemblyDraftInput,
} from '@/lib/assemblies/service';
import type { AssemblyModality, AssemblySessionType, AttendanceCapacity, AttendanceMode, ProxyKind, VoteChoice } from '@/lib/assemblies/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/assemblies';

async function requireActor(): Promise<AssemblyActor> {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) throw new AssemblyError('Inicia sesión.', 401);
    if (!profile.community_id) throw new AssemblyError('Tu cuenta no está asociada a una comunidad.', 403);
    if (profile.role === 'concierge') throw new AssemblyError('Las asambleas son para copropietarios y administración.', 403);
    return { id: profile.id, role: profile.role, communityId: profile.community_id, unitId: profile.unit_id ?? null };
}

function respondError(req: NextRequest, error: unknown) {
    if (error instanceof AssemblyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiErrorResponse(req, ROUTE, error, { publicMessage: 'No se pudo completar la acción de la asamblea.' });
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const id = (value: unknown) => text(value, 60);
const optionalId = (value: unknown) => (typeof value === 'string' && value.length >= 30 ? value.slice(0, 60) : null);
const isoDate = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

function draftInput(body: Record<string, unknown>): AssemblyDraftInput {
    const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
    const share = typeof body.requestRightsShare === 'number' && Number.isFinite(body.requestRightsShare) ? Math.min(1, Math.max(0, body.requestRightsShare)) : null;
    const expense = body.extraordinaryExpense && typeof body.extraordinaryExpense === 'object' ? body.extraordinaryExpense as Record<string, unknown> : null;
    return {
        title: text(body.title, 160),
        sessionType: text(body.sessionType, 20) as AssemblySessionType,
        modality: text(body.modality, 20) as AssemblyModality,
        scheduledAt: text(body.scheduledAt, 40),
        location: text(body.location, 300),
        videoUrl: text(body.videoUrl, 500).trim(),
        requestReceivedOn: isoDate(body.requestReceivedOn),
        requestRightsShare: isoDate(body.requestReceivedOn) ? share : null,
        secretaryProfileId: optionalId(body.secretaryProfileId),
        notaryName: text(body.notaryName, 160),
        items: items.map(raw => {
            const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
            return { matterCode: text(item.matterCode, 60), title: text(item.title, 200), description: text(item.description, 2000) };
        }),
        extraordinaryExpense: expense && Number(expense.monthlyOrdinaryTotal) > 0 ? {
            amount: Number(expense.amount) || 0, monthlyOrdinaryTotal: Number(expense.monthlyOrdinaryTotal), approvedLast12Months: Number(expense.approvedLast12Months) || 0,
        } : null,
    };
}

/**
 * GET                      lista de asambleas visibles para el usuario
 * GET ?id=<uuid>           detalle (lo que el rol puede ver)
 * GET ?catalog=1           catálogo de materias del art. 15 y residentes (admin)
 */
export async function GET(req: NextRequest) {
    try {
        const actor = await requireActor();
        const params = req.nextUrl.searchParams;
        if (params.get('catalog')) {
            return NextResponse.json({ matters: ASSEMBLY_MATTERS, residents: actor.role === 'admin' ? await listCommunityResidents(actor) : [] });
        }
        const assemblyId = params.get('id');
        if (assemblyId) return NextResponse.json(await getAssemblyView(actor, assemblyId.slice(0, 60)));
        return NextResponse.json(await listAssemblies(actor));
    } catch (error) { return respondError(req, error); }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'assemblies', { limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const actor = await requireActor();
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const assemblyId = id(body.assemblyId);
        switch (body.action) {
            case 'create': return NextResponse.json(await createAssembly(actor, draftInput(body)), { status: 201 });
            case 'update': return NextResponse.json(await updateAssemblyDraft(actor, assemblyId, draftInput(body)));
            case 'draft_citation': return NextResponse.json(await draftCitation(actor, assemblyId));
            case 'publish': return NextResponse.json(await publishCitation(actor, assemblyId, typeof body.citationText === 'string' ? body.citationText.slice(0, 12000) : undefined));
            case 'cancel': return NextResponse.json(await cancelAssembly(actor, assemblyId));
            case 'rsvp': return NextResponse.json(await rsvp(actor, assemblyId, id(body.unitId), body.mode === 'remote' ? 'remote' : 'in_person', body.attending !== false));
            case 'register_proxy': return NextResponse.json(await registerProxy(actor, assemblyId, {
                unitId: id(body.unitId), kind: (text(body.kind, 30) || 'proxy') as ProxyKind, proxyProfileId: optionalId(body.proxyProfileId),
                proxyName: text(body.proxyName, 160), coversReinforced: body.coversReinforced === true, documentNote: text(body.documentNote, 500),
            }));
            case 'review_proxy': {
                const decision = body.decision === 'accept' || body.decision === 'reject' || body.decision === 'revoke' ? body.decision : null;
                if (!decision) throw new AssemblyError('Decisión no válida.');
                return NextResponse.json(await reviewProxy(actor, assemblyId, id(body.proxyId), decision));
            }
            case 'start': return NextResponse.json(await startSession(actor, assemblyId));
            case 'check_in': return NextResponse.json(await checkIn(actor, assemblyId, {
                unitId: id(body.unitId), capacity: (['owner', 'proxy', 'occupant'].includes(String(body.capacity)) ? body.capacity : 'owner') as AttendanceCapacity,
                attendeeProfileId: optionalId(body.attendeeProfileId), attendeeName: text(body.attendeeName, 160), proxyId: optionalId(body.proxyId),
                mode: (body.mode === 'remote' ? 'remote' : 'in_person') as AttendanceMode, verified: body.verified === true,
            }));
            case 'verify_attendance': return NextResponse.json(await verifyAttendance(actor, assemblyId, id(body.attendanceId)));
            case 'mark_left': return NextResponse.json(await markLeft(actor, assemblyId, id(body.attendanceId)));
            case 'open_vote': return NextResponse.json(await openVote(actor, assemblyId, id(body.itemId)));
            case 'cast_vote': return NextResponse.json(await castVote(actor, assemblyId, id(body.itemId), id(body.unitId), text(body.choice, 10) as VoteChoice));
            case 'record_vote': return NextResponse.json(await recordVote(actor, assemblyId, id(body.itemId), id(body.unitId), text(body.choice, 10) as VoteChoice));
            case 'verify_vote': return NextResponse.json(await verifyVote(actor, assemblyId, id(body.voteId)));
            case 'close_vote': return NextResponse.json(await closeVote(actor, assemblyId, id(body.itemId), body.force === true, text(body.notes, 2000)));
            case 'close': return NextResponse.json(await closeSession(actor, assemblyId));
            case 'regenerate_minutes': return NextResponse.json(await regenerateMinutes(actor, assemblyId));
            case 'save_minutes': return NextResponse.json(await saveMinutes(actor, assemblyId, text(body.content, 40000)));
            case 'sign_minutes': return NextResponse.json(await signMinutes(actor, assemblyId, text(body.signers, 1000), typeof body.content === 'string' ? body.content.slice(0, 40000) : undefined));
            default: throw new AssemblyError('Acción no soportada.');
        }
    } catch (error) { return respondError(req, error); }
}
