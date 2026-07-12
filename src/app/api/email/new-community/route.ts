import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Community notifications are emitted atomically by /api/admin-onboarding/register.
 * Keeping this retired route explicit prevents old clients from becoming an email relay.
 */
export async function POST() {
    return NextResponse.json(
        { error: 'Este envío sólo se ejecuta dentro del registro seguro de comunidades.' },
        { status: 410 },
    );
}
