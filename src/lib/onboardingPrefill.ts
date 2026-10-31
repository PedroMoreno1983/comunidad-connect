import type { OnboardingConversationDraft } from '@/lib/types';

/** Public URL data only. The recipient reviews it before creating an account. */
export function onboardingPrefillFromQuery(query: string): OnboardingConversationDraft | null {
    const params = new URLSearchParams(query);
    if (params.get('prefill') !== '1' || params.get('unitType') !== 'house') return null;
    const communityName = (params.get('communityName') || '').trim().slice(0, 180);
    const fullName = (params.get('fullName') || '').trim().slice(0, 140);
    const email = (params.get('email') || '').trim().toLowerCase().slice(0, 180);
    const range = /^(\d{1,3})-(\d{1,3})$/.exec(params.get('unitNumbers') || '');
    if (!communityName || !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !range) return null;
    const first = Number(range[1]);
    const last = Number(range[2]);
    if (first < 1 || last < first || last - first + 1 > 800) return null;
    return {
        communityName,
        unitType: 'house',
        unitCount: last - first + 1,
        unitNumbers: Array.from({ length: last - first + 1 }, (_, index) => String(first + index)),
        address: (params.get('address') || '').trim().slice(0, 300),
        fullName,
        email,
        planId: null,
    };
}
