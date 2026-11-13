import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { mediaFailure } from '@/lib/server/providerAccess';
import { resolvePortalProvider } from '@/lib/services/providerPortal';
import { uploadProviderDocument } from '@/lib/services/providerMedia';

export const runtime = 'nodejs';

/** El maestro sube su certificado de antecedentes o su cédula (multipart: kind, file). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'provider_portal.documents', { limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const { token } = await params;
    try {
        const { providerId } = await resolvePortalProvider(token);
        const form = await request.formData();
        const file = form.get('file');
        return NextResponse.json(await uploadProviderDocument(
            providerId, String(form.get('kind') || ''), file instanceof File ? file : null, { id: null, role: 'external_provider' }, 'provider_portal',
        ), { status: 201 });
    } catch (error) {
        return mediaFailure(error);
    }
}
