/**
 * Cómo se nombra una unidad. Un condominio de casas (Bahía Las Palmas, en
 * Rapel) no tiene "Depto 12, Torre Casas, piso 1": tiene "Casa 12". La base ya
 * lo distingue en units.type ('house' | 'apartment'); esto lo lleva a la vista.
 */

export type UnitKind = 'apartment' | 'house';

type UnitLike = { type?: string | null; number?: string | number | null; tower?: string | null; floor?: number | string | null };

export function unitKind(type: string | null | undefined): UnitKind {
    return type === 'house' ? 'house' : 'apartment';
}

/** "Casa" o "Depto". */
export function unitNoun(type: string | null | undefined): string {
    return unitKind(type) === 'house' ? 'Casa' : 'Depto';
}

/** "Casa 12" o "Depto 1204". */
export function unitName(unit: UnitLike): string {
    return `${unitNoun(unit.type)} ${unit.number ?? ''}`.trim();
}

/**
 * Ubicación legible. Una casa no tiene piso; su "torre" solo se muestra si es
 * un sector real (no el "Casas" con que se cargó el condominio).
 */
export function unitLocation(unit: UnitLike): string {
    const tower = String(unit.tower ?? '').trim();
    if (unitKind(unit.type) === 'house') {
        return tower && !/^casas?$/i.test(tower) ? `Sector ${tower}` : '—';
    }
    return `Torre ${tower || '-'}, piso ${unit.floor ?? '-'}`;
}

/**
 * Nombre de la unidad de un residente: "Casa 12", o "Depto B-1204" cuando la
 * torre distingue (la torre "A" por defecto no se nombra).
 */
export function residentUnitLabel(unit: UnitLike): string {
    const number = String(unit.number ?? '').trim();
    const tower = String(unit.tower ?? '').trim();
    if (unitKind(unit.type) === 'house') return `Casa ${number}`;
    return `Depto ${tower && tower !== 'A' ? `${tower}-` : ''}${number}`;
}

/** Tipo predominante de una lista de unidades: decide cómo se habla del condominio. */
export function predominantKind(units: UnitLike[]): UnitKind {
    const houses = units.filter(unit => unitKind(unit.type) === 'house').length;
    return houses > 0 && houses >= units.length - houses ? 'house' : 'apartment';
}
