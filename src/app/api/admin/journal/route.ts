import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import { getJournal, postJournalEntry, type JournalLineInput } from '@/lib/finance/journalService';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function journalLines(value: unknown): JournalLineInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const line = row as Record<string, unknown>;
    const code = cleanText(line.code, 8);
    if (!code) return [];
    return [{
      code,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
    }];
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    return NextResponse.json(await getJournal(auth.communityId));
  } catch (error) {
    return apiErrorResponse(req, '/api/admin/journal', error, {
      publicMessage: 'No se pudo cargar el libro diario.',
    });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceDistributedRateLimit(req, 'admin.journal.write', { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const auth = await requireCommunityAdmin();
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const entry = await postJournalEntry(auth.communityId, auth.profile.id, {
      entryDate: cleanText(body.entryDate, 10),
      memo: cleanText(body.memo, 240),
      source: 'manual',
      lines: journalLines(body.lines),
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof BillingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(req, '/api/admin/journal', error, {
      publicMessage: 'No se pudo guardar el asiento.',
    });
  }
}
