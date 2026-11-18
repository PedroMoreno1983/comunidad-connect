import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import {
    UtilityAccountError, createResidentAccount, deleteResidentAccount, listResidentAccounts, updateResidentAccount,
} from '@/lib/utilities/residentAccounts';

export const runtime = 'nodejs';

/**
 * Cuentas personales de luz, agua y gas. Cada persona ve y edita solo las
 * suyas, sea cual sea su rol: la administración no tiene una vía para leerlas.
 */

async function owner() {
    const profile = await getAuthenticatedAgentProfile();
    return profile?.id ?? null;
}

function failure(error: unknown) {
    if (error instanceof UtilityAccountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-accounts]', error);
    return NextResponse.json({ error: 'No se pudo guardar. Intenta de nuevo.' }, { status: 500 });
}

export async function GET() {
    const userId = await owner();
    if (!userId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        return NextResponse.json({ accounts: await listResidentAccounts(userId) });
    } catch (error) {
        return failure(error);
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'resident.utility_accounts', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const userId = await owner();
    if (!userId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        return NextResponse.json({ account: await createResidentAccount(userId, body) }, { status: 201 });
    } catch (error) {
        return failure(error);
    }
}

export async function PATCH(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'resident.utility_accounts', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const userId = await owner();
    if (!userId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        const id = typeof body.id === 'string' ? body.id : '';
        if (!id) throw new UtilityAccountError('Falta la cuenta.');
        return NextResponse.json({ account: await updateResidentAccount(userId, id, body) });
    } catch (error) {
        return failure(error);
    }
}

export async function DELETE(req: NextRequest) {
    const userId = await owner();
    if (!userId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    try {
        const id = req.nextUrl.searchParams.get('id') || '';
        if (!id) throw new UtilityAccountError('Falta la cuenta.');
        await deleteResidentAccount(userId, id);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure(error);
    }
}
