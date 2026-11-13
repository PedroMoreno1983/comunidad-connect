import type { Metadata } from 'next';
import { ProviderPortalClient } from '@/components/services/ProviderPortalClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Portal del proveedor',
    robots: { index: false, follow: false },
    // El token va en la URL: que no viaje como referer a otros sitios.
    referrer: 'no-referrer',
};

/** Portal del maestro externo, con el enlace personal que le envió la administración. */
export default async function ProviderPortalPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <ProviderPortalClient token={token} />;
}
