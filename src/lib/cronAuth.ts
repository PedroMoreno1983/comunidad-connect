/** Vercel Cron envía `Authorization: Bearer $CRON_SECRET`. El header viejo sigue valiendo para llamadas manuales. */
export function cronAccess(
  secret: string | undefined,
  authorization: string | null,
  legacyHeader: string | null,
): 'ok' | 'missing' | 'rejected' {
  const expected = secret?.trim() ?? '';
  if (!expected) return 'missing';
  if (authorization === `Bearer ${expected}`) return 'ok';
  if (legacyHeader === expected) return 'ok';
  return 'rejected';
}
