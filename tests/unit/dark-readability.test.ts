/**
 * Residentes reportaron que el modo oscuro costaba leer. El tema por defecto
 * es "system", así que lo ve cualquiera con el celular en oscuro. La medición
 * mostró textos de 2,3 a 4,1:1. Este test fija el piso: cada token que se usa
 * como texto en modo oscuro cumple WCAG AA (4,5:1) sobre lienzo, tarjeta y
 * superficie elevada, y la hoja que lo aplica compila sin descartar reglas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from 'lightningcss';

const root = path.resolve(__dirname, '../..');
const tokens = fs.readFileSync(path.join(root, 'src/app/tokens.css'), 'utf8');
const darkBlock = tokens.slice(tokens.indexOf('.dark {'), tokens.indexOf('}', tokens.indexOf('.dark {')));

function darkToken(name: string) {
    const match = darkBlock.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
    if (!match) throw new Error(`--${name} no está definido con un hex en .dark`);
    return match[1];
}

function luminance(hex: string) {
    const channel = (i: number) => {
        const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['cc-ivory', 'cc-paper', 'cc-paper-warm'];
// ink-faint incluido: se usa como texto en ~30 lugares, no solo deshabilitado.
const READABLE_TEXT = ['cc-ink', 'cc-ink-soft', 'cc-ink-muted', 'cc-ink-tertiary', 'cc-ink-faint', 'cc-copper-text', 'cc-sage-text', 'cc-rose-text', 'cc-plum-text'];

const rules = () => fs.readFileSync(path.join(root, 'src/app/dark-readability.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map(rule => rule.split('{')[0].trim())
    .filter(Boolean);

describe('modo oscuro legible', () => {
    it.each(READABLE_TEXT)('--%s cumple 4,5:1 sobre todas las superficies oscuras', (token) => {
        for (const surface of SURFACES) {
            expect(contrast(darkToken(token), darkToken(surface)), `${token} sobre ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('cada regla respeta variantes propias, superficies claras y estados de interacción', () => {
        for (const selector of rules()) {
            expect(selector, selector.slice(0, 80)).toContain(':not([class*="dark:text-"])');
            expect(selector, selector.slice(0, 80)).toContain('.bg-white');
            expect(selector, selector.slice(0, 80)).toContain('[class*="hover:text-"]:hover');
        }
    });

    it('las superficies claras se reconocen por clase exacta, no por sufijo (opacity-50 no es un fondo)', () => {
        for (const selector of rules()) expect(selector).not.toMatch(/\[class[*$]="-(50|100)/);
    });

    it('dark-readability.css compila sin advertencias y está importada', () => {
        const css = fs.readFileSync(path.join(root, 'src/app/dark-readability.css'));
        const result = transform({ filename: 'dark-readability.css', code: css, errorRecovery: true });
        expect(result.warnings).toEqual([]);
        expect(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')).toContain('@import "./dark-readability.css";');
    });

    it('todas las reglas quedan bajo .dark: el tema claro no cambia', () => {
        const css = fs.readFileSync(path.join(root, 'src/app/dark-readability.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const selectors = css.split('{').slice(0, -1).map(part => part.split('}').pop()!.trim()).filter(Boolean);
        expect(selectors.length).toBeGreaterThan(0);
        for (const selector of selectors) expect(selector.startsWith(':where(.dark)'), selector).toBe(true);
    });
});
