import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { findBuildingForAddress, parseBuildingAddress } from '@/lib/onboarding/residentBuilding';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Alguien quiere entrar a Convive y su edificio ya contrató, pero no tiene el
 * código: con su consentimiento explícito (este botón), se avisa a la
 * administración para que le envíe el código. No crea cuenta ni da acceso.
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'auth.building_access_request', { limit: 3, windowMs: 60 * 60_000 });
    if (limited) return limited;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const fullName = cleanText(body.fullName, 140);
    const email = cleanText(body.email, 180).toLowerCase();
    const departmentNumber = cleanText(body.departmentNumber, 40);
    const address = parseBuildingAddress(body.address);
    if (!fullName || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) || !departmentNumber || !address) {
        return NextResponse.json({ error: 'Completa tu nombre, correo, departamento y dirección.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const building = await findBuildingForAddress(admin, address);
    // Misma respuesta si no hay edificio administrado: no se revela qué edificios usan Convive.
    if (!building?.managed) return NextResponse.json({ ok: true });

    const { data: admins } = await admin.from('profiles').select('id').eq('community_id', building.id).eq('role', 'admin');
    if (admins?.length) {
        await admin.from('notifications').insert(admins.map(row => ({
            user_id: row.id,
            community_id: building.id,
            type: 'info',
            category: 'access_request',
            title: 'Un vecino pidió el código de Convive',
            body: `${fullName} (depto ${departmentNumber}, ${email}) quiere entrar a Convive. Si vive en el edificio, envíale el código de residentes.`,
            link: '/admin/users',
        })));
    }
    return NextResponse.json({ ok: true });
}
