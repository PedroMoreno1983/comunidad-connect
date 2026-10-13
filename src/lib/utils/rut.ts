/** RUT chileno: número y dígito verificador validado por módulo 11, o null si no es válido. */
export function splitRut(rut: string): { number: string; dv: string } | null {
    const clean = rut.replace(/[^\dkK]/g, '').toUpperCase();
    if (clean.length < 2) return null;
    const number = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let sum = 0;
    let factor = 2;
    for (let i = number.length - 1; i >= 0; i -= 1) {
        sum += Number(number[i]) * factor;
        factor = factor === 7 ? 2 : factor + 1;
    }
    const expected = 11 - (sum % 11);
    const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected);
    return expectedDv === dv && Number(number) > 0 ? { number: String(Number(number)), dv } : null;
}

/** RUT en la forma que usa el SII en los documentos: "76795561-8". */
export function normalizeRut(rut: string): string | null {
    const parts = splitRut(rut);
    return parts ? `${parts.number}-${parts.dv}` : null;
}
