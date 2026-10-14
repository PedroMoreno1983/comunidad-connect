import type { AssemblyMatter, QuorumClass } from './types';

/**
 * Catálogo de materias del cuadro del art. 15 de la Ley 21.442 (texto vigente
 * con la Ley 21.508, revisado en bcn.cl el 2026-10-14).
 *
 * El quórum sale de la fila del cuadro a la que pertenece la materia:
 *   1) Ordinaria                          -> 'ordinary'
 *   2) Extraordinaria de mayoría absoluta -> 'absolute'
 *   3) Extraordinaria de mayoría reforzada -> 'reinforced'
 *
 * Notario (art. 15, inciso final): asiste a las sesiones del numeral 3) y a
 * las que tratan la letra a) del numeral 2) (modificación del reglamento).
 * El acta "deberá reducirse a escritura pública si la naturaleza del acuerdo
 * lo requiere": eso es una advertencia, no una regla automática.
 */
const m = (code: string, quorumClass: QuorumClass, reference: string, label: string, requiresNotary = quorumClass === 'reinforced'): AssemblyMatter => ({
    code, quorumClass, reference, label, requiresNotary, mayRequirePublicDeed: requiresNotary,
});

export const ASSEMBLY_MATTERS: readonly AssemblyMatter[] = [
    // 1) Ordinaria
    m('ord_rendicion_cuentas', 'ordinary', '1) a)', 'Rendición de cuentas del administrador y aprobación del balance'),
    m('ord_comite', 'ordinary', '1) b)', 'Designación, reelección o renuncia de miembros del comité de administración'),
    m('ord_administrador', 'ordinary', '1) c)', 'Designación o remoción del administrador o subadministrador'),
    m('ord_plan_emergencia', 'ordinary', '1) d)', 'Reporte de actualizaciones del plan de emergencia, simulacros y capacitación'),
    m('ord_seguro', 'ordinary', '1) e)', 'Término anticipado de la póliza o nuevo seguro sin modificar los riesgos cubiertos'),
    m('ord_otro', 'ordinary', '1) f)', 'Otro asunto de interés de los copropietarios (no reservado a sesión extraordinaria)'),
    // 2) Extraordinaria de mayoría absoluta
    m('abs_reglamento', 'absolute', '2) a)', 'Modificación del reglamento de copropiedad (salvo materias de las letras d) y f) del numeral 3)', true),
    m('abs_remocion_comite', 'absolute', '2) b)', 'Remoción parcial o total de los miembros del comité de administración'),
    m('abs_gastos_extraordinarios', 'absolute', '2) c)', 'Gastos o inversiones extraordinarias que excedan seis cuotas de gasto común ordinario en doce meses'),
    m('abs_administracion_conjunta', 'absolute', '2) d)', 'Administración conjunta de condominios o subadministraciones'),
    m('abs_autofinanciamiento', 'absolute', '2) e)', 'Programas de autofinanciamiento y asociaciones con terceros'),
    m('abs_fondo_reserva_recargo', 'absolute', '2) f)', 'Fijación del recargo sobre los gastos comunes para el fondo común de reserva'),
    m('abs_fondo_reserva_uso', 'absolute', '2) g)', 'Uso del fondo común de reserva para gastos comunes ordinarios de mantención o reparación'),
    m('abs_alteraciones_bienes_comunes', 'absolute', '2) h)', 'Alteraciones a los bienes comunes'),
    // 3) Extraordinaria de mayoría reforzada
    m('ref_reglamento', 'reinforced', '3) a)', 'Modificación del reglamento de copropiedad en materias de las letras d) y f) de este numeral'),
    m('ref_delegacion', 'reinforced', '3) b)', 'Delegación de facultades al comité (materias de las letras c), d) y e) del numeral 2)'),
    m('ref_enajenacion', 'reinforced', '3) c)', 'Enajenación, arrendamiento o cesión de bienes de dominio común, o gravámenes sobre ellos'),
    m('ref_reconstruccion', 'reinforced', '3) d)', 'Reconstrucción o demolición del condominio'),
    m('ref_desafectacion', 'reinforced', '3) e)', 'Petición a la DOM para dejar sin efecto o modificar la declaración de copropiedad'),
    m('ref_cambio_destino_unidades', 'reinforced', '3) f)', 'Cambio de destino de las unidades del condominio'),
    m('ref_ampliaciones', 'reinforced', '3) g)', 'Obras de ampliación del condominio, ampliaciones o alteraciones de sus unidades'),
    m('ref_construcciones_bienes_comunes', 'reinforced', '3) h)', 'Construcciones en los bienes comunes y cambios de destino de esos bienes'),
    m('ref_uso_goce_exclusivo', 'reinforced', '3) i)', 'Derechos de uso y goce exclusivo de bienes comunes u otras formas de aprovechamiento'),
    m('ref_retribucion_comite', 'reinforced', '3) j)', 'Retribución al comité mediante descuento en los gastos comunes'),
    m('ref_seguro_riesgos', 'reinforced', '3) k)', 'Nuevo seguro que modifique los riesgos cubiertos (p. ej. sismo o salida de mar)'),
] as const;

const BY_CODE = new Map(ASSEMBLY_MATTERS.map(matter => [matter.code, matter]));

export function findMatter(code: string): AssemblyMatter | null {
    return BY_CODE.get(code) ?? null;
}

export const QUORUM_CLASS_LABEL: Record<QuorumClass, string> = {
    ordinary: 'Ordinaria',
    absolute: 'Extraordinaria de mayoría absoluta',
    reinforced: 'Extraordinaria de mayoría reforzada',
};
