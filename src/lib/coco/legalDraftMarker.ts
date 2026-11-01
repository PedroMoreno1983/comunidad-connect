/** Encabezado obligatorio de todo borrador legal de CoCo. Sin dependencias de servidor: lo usa también el chat. */
export const LEGAL_DRAFT_MARKER = 'BORRADOR PARA REVISIÓN DE ABOGADO';

/** Roles que pueden generar y descargar borradores legales: solo la administración de la comunidad. */
export const LEGAL_DRAFT_ROLES = ['admin'] as const;
export function canDraftLegalDocuments(role?: string | null) {
    return (LEGAL_DRAFT_ROLES as readonly string[]).includes(String(role || ''));
}
export const LEGAL_DRAFT_ADMIN_ONLY_MESSAGE = 'Los borradores de reglamentos, contratos y actas solo los puede generar la administración de la comunidad. Si lo necesitas, pídeselo a tu administrador o al comité.';
