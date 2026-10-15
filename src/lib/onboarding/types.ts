import type {
    ExtractedResident,
    OnboardingBatchExtractResponse,
    OnboardingBatchRetryResponse,
    OnboardingBatchStoredRow,
    OnboardingExtractedRow,
    OnboardingUpsertResponse,
} from '@/lib/types';

/**
 * Tipos de los derechos por unidad (‰) en el onboarding. Viven aquí y no en
 * `src/lib/types.ts` porque ese archivo ya no se puede publicar por la API de
 * GitHub (mismo criterio que `src/lib/assemblies/types.ts`).
 */

/** Cómo viene expresada la columna de derechos: por mil (‰) o por ciento (%). */
export type RightsScale = 'permille' | 'percent';

/** Fila extraída con sus derechos en ‰ como texto editable ("12,5"; vacío si no vino). */
export interface ExtractedResidentWithRights extends ExtractedResident {
    derechos_permil: string;
}

export interface OnboardingRightsRow extends OnboardingExtractedRow {
    derechos_permil: string;
}

/** Qué columna se leyó y cómo se interpretó (para mostrarlo en la vista previa). */
export interface OnboardingRightsMeta {
    header: string;
    scale: RightsScale;
    /** true si la escala se dedujo (encabezado ambiguo como "prorrateo" o "alícuota"). */
    scaleInferred: boolean;
    /** Cantidad de unidades con un valor en el archivo. */
    unitsWithValue: number;
}

export interface OnboardingPendingTask {
    id: 'unit_rights';
    title: string;
    detail: string;
    href: string;
}

/** Vista previa de los derechos antes de sincronizar (solo con lo que trae el lote). */
export interface OnboardingRightsPreview {
    /** none: no vienen; partial: faltan, hay errores o no suman 1000‰; complete: todos y suman 1000‰ ± 0,5. */
    status: 'none' | 'partial' | 'complete';
    units: number;
    unitsWithValue: number;
    total: number;
    difference: number;
    errors: string[];
    /** Unidades con dos valores distintos en el lote. */
    conflicts: string[];
    /** Con fuente quedan verificados; sin fuente, provisorios. */
    willBeVerified: boolean;
    task: OnboardingPendingTask | null;
}

/** Resultado de los derechos al sincronizar. */
export interface OnboardingRightsOutcome {
    /** saved: guardados con auditoría; skipped: venían pero no se guardaron; none: no venían; already_loaded: no venían y la comunidad ya los tenía. */
    status: 'saved' | 'skipped' | 'none' | 'already_loaded';
    verified: boolean;
    errors: string[];
    task: OnboardingPendingTask | null;
}

export type OnboardingRightsExtractResponse = Omit<OnboardingBatchExtractResponse, 'data'> & {
    data?: OnboardingRightsRow[];
    rights?: OnboardingRightsMeta | null;
};

export type OnboardingRightsStoredRow = OnboardingBatchStoredRow & { derechos_permil: string };

export type OnboardingRightsRetryResponse = Omit<OnboardingBatchRetryResponse, 'data'> & {
    data?: OnboardingRightsRow[];
};

export type OnboardingRightsUpsertResponse = OnboardingUpsertResponse & {
    rights?: OnboardingRightsOutcome;
};
