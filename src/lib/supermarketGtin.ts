/**
 * GTIN canónico para cruzar el mismo producto entre supermercados.
 *
 * Cada cadena guarda el código distinto: Lider usa 14 dígitos con ceros a la
 * izquierda y SIN dígito verificador ("00780462162162" = 780462162162 + DV),
 * mientras Santa Isabel, Unimarc y aCuenta traen el EAN-13/UPC-A completo.
 * Esta regla es la misma de `supermarket_normalize_gtin` (migración
 * 20261017120000) y de `scripts/supermarket_gtin.py`; si cambia una, cambian
 * las tres.
 */

/** Dígito verificador GS1 (mod 10, pesos 3-1 desde la derecha). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let offset = 0; offset < body.length; offset += 1) {
    const digit = Number(body[body.length - 1 - offset]);
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Pesables y códigos internos: cada cadena los reutiliza para otra cosa. */
function isRestrictedCirculation(padded: string): boolean {
  return padded.length === 13 && (
    padded.startsWith('2')
    || padded.startsWith('02')
    || padded.startsWith('04')
    || padded.startsWith('000000')
    || padded.startsWith('000002')
  );
}

/**
 * Devuelve el GTIN-13 (o GTIN-14 con indicador) canónico, o null si el código
 * no sirve para cruzar tiendas: vacío, PLU interno, DV inválido o de
 * circulación restringida.
 */
export function normalizeGtin(code: unknown, store?: string | null): string | null {
  if (code === null || code === undefined) return null;
  const raw = String(code).trim().replace(/[\s-]/g, '');
  if (!/^\d+$/.test(raw)) return null;
  let digits = raw.replace(/^0+/, '');
  if (!digits) return null;

  if (store === 'Lider' && digits.length >= 7 && digits.length <= 12) {
    digits = `${digits}${gtinCheckDigit(digits)}`;
  }
  if (digits.length < 8 || digits.length > 14) return null;
  if (gtinCheckDigit(digits.slice(0, -1)) !== Number(digits.slice(-1))) return null;

  const padded = digits.padStart(13, '0');
  return isRestrictedCirculation(padded) ? null : padded;
}
