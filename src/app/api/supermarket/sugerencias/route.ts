import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/observability/logger';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { suggestShoppingTerms } from '@/lib/supermarketSuggestions';
import type { ShoppingSuggestionsResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_QUERY_LENGTH = 60;

export async function GET(req: NextRequest) {
  // El limite es alto porque esto responde mientras alguien escribe. La pantalla
  // espera a que deje de teclear antes de preguntar, asi que una lista completa
  // son pocas decenas de consultas, no una por letra.
  const limited = await enforceDistributedRateLimit(req, 'supermarket.suggest', {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const supabaseUser = await getSupabaseUserClient();
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const query = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH);
    const payload: ShoppingSuggestionsResponse = {
      suggestions: await suggestShoppingTerms(query),
    };
    return NextResponse.json(payload);
  } catch (error) {
    return apiErrorResponse(req, '/api/supermarket/sugerencias', error, {
      publicMessage: 'No se pudieron cargar las sugerencias.',
    });
  }
}
