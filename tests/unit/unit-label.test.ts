/** Bahía Las Palmas (Rapel) es un condominio de casas: "Casa 12", no "Depto 12, Torre Casas, piso 1". */
import { describe, expect, it } from 'vitest';
import { predominantKind, residentUnitLabel, unitLocation, unitName, unitNoun } from '@/lib/units/unitLabel';

describe('nombre de la unidad', () => {
    it('una casa se llama casa y no tiene piso', () => {
        const house = { type: 'house', tower: 'Casas', number: '12', floor: 1 };
        expect(unitName(house)).toBe('Casa 12');
        expect(unitLocation(house)).toBe('—');
        expect(unitLocation({ ...house, tower: 'Los Pinos' })).toBe('Sector Los Pinos');
        expect(residentUnitLabel(house)).toBe('Casa 12');
    });

    it('un departamento mantiene torre y piso', () => {
        const apartment = { type: 'apartment', tower: 'B', number: '1204', floor: 12 };
        expect(unitName(apartment)).toBe('Depto 1204');
        expect(unitLocation(apartment)).toBe('Torre B, piso 12');
        expect(residentUnitLabel(apartment)).toBe('Depto B-1204');
        expect(residentUnitLabel({ ...apartment, tower: 'A' })).toBe('Depto 1204');
    });

    it('sin tipo se asume departamento', () => {
        expect(unitNoun(null)).toBe('Depto');
        expect(unitNoun(undefined)).toBe('Depto');
    });

    it('el tipo del condominio es el de la mayoría de sus unidades', () => {
        expect(predominantKind([{ type: 'house' }, { type: 'house' }, { type: 'apartment' }])).toBe('house');
        expect(predominantKind([{ type: 'apartment' }, { type: null }])).toBe('apartment');
        expect(predominantKind([])).toBe('apartment');
    });
});
