/**
 * 22-11-2026, prueba de punta a punta por WhatsApp (número compartido con Norma):
 * - `new NextResponse('', { status: 204 })` revienta en Next ("Invalid response
 *   status code 204") y devolvía 500 a Scrapp y a los avisos de entrega de Twilio.
 * - El primer mensaje "Hola CoCo, ¿cuánto debo?" se descartaba: la regla exigía
 *   el saludo solo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
}

describe('WhatsApp por el número compartido', () => {
    it('ninguna ruta arma un 204 con cuerpo', () => {
        const offenders = files('src/app/api').filter(file => /new NextResponse\((['"`])\1,\s*\{\s*status:\s*204/.test(readFileSync(file, 'utf8')));
        expect(offenders).toEqual([]);
    });

    it('el primer mensaje abre conversación si empieza con "Hola CoCo" o "CoCo"', () => {
        const route = readFileSync('src/app/api/coco/whatsapp/route.ts', 'utf8');
        const match = route.match(/!\/(\^\(hola\\s\+\)\?coco\\b)\/i\.test\(message\)/);
        expect(match).not.toBeNull();
        const greeting = new RegExp(match![1], 'i');
        expect(greeting.test('Hola CoCo, ¿cuánto debo de gastos comunes?')).toBe(true);
        expect(greeting.test('coco')).toBe(true);
        expect(greeting.test('Norma, necesito ayuda con un contrato')).toBe(false);
        expect(greeting.test('Hola, ¿cómo estás?')).toBe(false);
    });
});
