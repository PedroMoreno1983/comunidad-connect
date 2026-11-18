import { NextResponse } from 'next/server';
import { getRequestId } from '@/lib/operations/audit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { syncResidentRoster } from '@/lib/onboarding/rosterSync';

export async function POST(request: Request) {
    const profile = await getAuthenticatedAgentProfile();
    const body = await request.json().catch(() => null);
    const result = await syncResidentRoster(profile, body, getRequestId(request));
    return NextResponse.json(result.payload, { status: result.status });
}
