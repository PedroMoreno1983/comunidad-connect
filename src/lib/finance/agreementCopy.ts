/**
 * Textos de convenios de pago que ven el residente y el admin. Módulo puro (lo
 * importan la UI y el servidor). Convención: sin montos, sin lenguaje de deudor,
 * dicho en positivo. La primera cuota vence al firmar el convenio y, al pagarla,
 * el copropietario queda hábil para votar (Ley 21.442 art. 6; DS 7 art. 9).
 */
export const AGREEMENT_SIGNING_COPY = 'Al firmar pagas la primera cuota y quedas habilitado para votar en asambleas.';

/** Convenio que espera al comité: se firma el día en que lo aprueba. */
export const AGREEMENT_PENDING_COMMITTEE_COPY = 'Cuando el comité lo apruebe, tu convenio queda firmado. Al firmar pagas la primera cuota y quedas habilitado para votar en asambleas.';

/** Para el admin, al abrir o aprobar un convenio. */
export const AGREEMENT_SIGNED_ADMIN_COPY = 'La primera cuota vence hoy: si se paga en el acto, la unidad queda habilitada para votar en asambleas.';
