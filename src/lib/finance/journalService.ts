import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, DATE_PATTERN } from './billingService';
import { assertBalancedJournal } from './operationalFlows';

export const LEDGER_ACCOUNTS = [
  { code: '1100', name: 'Banco', kind: 'asset' },
  { code: '4100', name: 'Ingresos por gastos comunes', kind: 'income' },
  { code: '5100', name: 'Remuneraciones', kind: 'expense' },
  { code: '5200', name: 'Gastos de operación', kind: 'expense' },
] as const;

export type JournalSource = 'manual' | 'agreement' | 'payroll';

export interface JournalLineInput {
  code: string;
  debit: number;
  credit: number;
}

export async function ensureLedgerAccounts(communityId: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('ledger_accounts').upsert(
    LEDGER_ACCOUNTS.map(account => ({ ...account, community_id: communityId })),
    { onConflict: 'community_id,code', ignoreDuplicates: true },
  );
  if (error) throw error;
  const { data, error: readError } = await admin
    .from('ledger_accounts')
    .select('id, code, name, kind')
    .eq('community_id', communityId)
    .order('code');
  if (readError) throw readError;
  return data || [];
}

export async function postJournalEntry(
  communityId: string,
  createdBy: string | null,
  input: { entryDate: string; memo: string; source: JournalSource; lines: JournalLineInput[] },
) {
  if (!DATE_PATTERN.test(input.entryDate)) {
    throw new BillingError('bad_date', 'La fecha del asiento va en formato AAAA-MM-DD.');
  }
  const memo = input.memo.trim().slice(0, 240);
  if (!memo) throw new BillingError('bad_label', 'El asiento necesita una glosa.');
  const totals = assertBalancedJournal(input.lines);
  const accounts = await ensureLedgerAccounts(communityId);
  const byCode = new Map(accounts.map(account => [account.code, account.id]));
  const rows = input.lines.map(line => {
    const accountId = byCode.get(line.code);
    if (!accountId) throw new BillingError('bad_account', `La cuenta ${line.code} no existe en el plan.`);
    return {
      account_id: accountId,
      debit: Math.round(line.debit) || 0,
      credit: Math.round(line.credit) || 0,
    };
  });

  const admin = getSupabaseAdmin();
  const { data: entry, error } = await admin
    .from('journal_entries')
    .insert({
      community_id: communityId,
      entry_date: input.entryDate,
      memo,
      source: input.source,
      created_by: createdBy,
    })
    .select('id, entry_date, memo, source, created_at')
    .single();
  if (error || !entry) throw error || new Error('No se pudo guardar el asiento.');

  const { error: lineError } = await admin.from('journal_lines').insert(
    rows.map(row => ({ ...row, entry_id: entry.id })),
  );
  if (lineError) {
    await admin.from('journal_entries').delete().eq('id', entry.id);
    throw lineError;
  }
  return { ...entry, total: totals.debit };
}

async function sumAllJournalLines(communityId: string) {
  const admin = getSupabaseAdmin();
  const totals = new Map<string, { debit: number; credit: number }>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('journal_lines')
      .select('account_id, debit, credit, journal_entries!inner(community_id)')
      .eq('journal_entries.community_id', communityId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const line of data || []) {
      const current = totals.get(line.account_id) || { debit: 0, credit: 0 };
      current.debit += Number(line.debit) || 0;
      current.credit += Number(line.credit) || 0;
      totals.set(line.account_id, current);
    }
    if (!data || data.length < pageSize) break;
  }
  return totals;
}

export async function getJournal(communityId: string) {
  const accounts = await ensureLedgerAccounts(communityId);
  const admin = getSupabaseAdmin();
  const [{ data: entries, error }, totals] = await Promise.all([
    admin
      .from('journal_entries')
      .select('id, entry_date, memo, source, created_at, journal_lines(id, account_id, debit, credit)')
      .eq('community_id', communityId)
      .order('entry_date', { ascending: false })
      .limit(40),
    sumAllJournalLines(communityId),
  ]);
  if (error) throw error;

  return {
    accounts: accounts.map(account => {
      const total = totals.get(account.id) || { debit: 0, credit: 0 };
      const natural = account.kind === 'asset' || account.kind === 'expense'
        ? total.debit - total.credit
        : total.credit - total.debit;
      return { ...account, debit: total.debit, credit: total.credit, balance: natural };
    }),
    entries: entries || [],
  };
}
