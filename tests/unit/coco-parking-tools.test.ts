import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, isToolAllowedForRole, MUTATING_TOOLS } from '../../src/lib/coco/tools';

/**
 * CoCo no sabía nada de estacionamientos: tenía 35 herramientas y ninguna
 * del módulo, y el system prompt no lo mencionaba. Un residente que
 * preguntara por su estacionamiento no obtenía respuesta útil.
 *
 * Definir la herramienta no basta: si no está en RESIDENT_TOOLS,
 * isToolAllowedForRole la rechaza y CoCo la ignora en silencio. Ese es el
 * modo de fallo que estos tests vigilan.
 */
const HERRAMIENTAS_PARKING = ['get_my_parking', 'search_parking'] as const;

describe('CoCo conoce el módulo de estacionamientos', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

    it.each(HERRAMIENTAS_PARKING)('%s está definida', (herramienta) => {
        expect(nombres).toContain(herramienta);
    });

    it.each(HERRAMIENTAS_PARKING)('%s es alcanzable por un residente', (herramienta) => {
        // Sin esto la herramienta existe pero CoCo nunca la ejecuta.
        expect(isToolAllowedForRole(herramienta, 'resident')).toBe(true);
    });

    it.each(HERRAMIENTAS_PARKING)('%s también sirve a staff', (herramienta) => {
        expect(isToolAllowedForRole(herramienta, 'admin')).toBe(true);
        expect(isToolAllowedForRole(herramienta, 'concierge')).toBe(true);
    });

    it('son de solo lectura: no piden confirmación al usuario', () => {
        for (const herramienta of HERRAMIENTAS_PARKING) {
            expect(MUTATING_TOOLS.has(herramienta)).toBe(false);
        }
    });

    it('describen cuándo usarlas, para que el modelo las elija', () => {
        const definiciones = TOOL_DEFINITIONS as ReadonlyArray<{ name: string; description: string }>;
        for (const herramienta of HERRAMIENTAS_PARKING) {
            const def = definiciones.find(d => d.name === herramienta);
            expect(def?.description ?? '').toMatch(/estacionamiento/i);
        }
    });
});
