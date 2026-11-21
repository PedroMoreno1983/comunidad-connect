/**
 * Tipos centralizados (CLAUDE.md): se importan siempre desde `@/lib/types`.
 *
 * Desde el 21-11-2026 este archivo es solo un barrel: cada dominio vive en
 * `src/lib/types/<dominio>.ts`. Un tipo nuevo va al archivo de su dominio; si
 * no calza en ninguno, a `platform.ts`. No agregues tipos aquí.
 */
export * from './types/amenities';
export * from './types/coco';
export * from './types/finance';
export * from './types/maintenance';
export * from './types/marketing';
export * from './types/platform';
export * from './types/providers';
export * from './types/social';
export * from './types/supermarket';
export * from './types/training';
export * from './types/users';
