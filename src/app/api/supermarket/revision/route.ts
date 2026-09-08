import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { reviewShoppingTerms } from '@/lib/supermarketSuggestions';
import type { ShoppingReviewResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_TERMS = 60;
const MAX_TERM_LENGTH = 80;

function parseTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map(entry => (typeof entry === 'string' ? entry.trim().slice(0, MAX_TERM_LENGTH) : ''))
      .filter(Boolean),
  )].slice(0, MAX_TERMS);
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'supermarket.review', {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const terms = parseTerms(body.terms);
    const payload: ShoppingReviewResponse = { items: await reviewShoppingTerms(terms) };
    return NextResponse.json(payload);
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/revision', error, {
      publicMessage: 'No se pudo revisar la lista.',
    });
  }
}
