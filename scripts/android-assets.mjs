/**
 * Íconos y pantallas de inicio de la app Android a partir de resources/.
 *   resources/icon.png             1024x1024, la "c" sobre tinta (ícono clásico y Google Play)
 *   resources/icon-foreground.png  1024x1024, la "c" dentro de la zona segura del ícono adaptable
 * Uso: node scripts/android-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const ICON = path.join(ROOT, 'resources/icon.png');
const FOREGROUND = path.join(ROOT, 'resources/icon-foreground.png');
const INK = '#1A1611';

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

async function roundIcon(size) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
    return sharp(ICON).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function splash(file) {
    const { width, height } = await sharp(file).metadata();
    // La "c" ocupa ~40% de la capa frontal; a 45% del lado corto queda de un tamaño discreto.
    const mark = Math.round(Math.min(width, height) * 0.45);
    const overlay = await sharp(FOREGROUND).resize(mark, mark).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: INK } })
        .composite([{ input: overlay, gravity: 'center' }])
        .png()
        .toFile(file + '.tmp');
    fs.renameSync(file + '.tmp', file);
}

(async () => {
    for (const [density, size] of Object.entries(LAUNCHER)) {
        const dir = path.join(RES, `mipmap-${density}`);
        await sharp(ICON).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
        fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await roundIcon(size));
        await sharp(FOREGROUND).resize(ADAPTIVE[density], ADAPTIVE[density]).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    }
    for (const dir of fs.readdirSync(RES)) {
        const file = path.join(RES, dir, 'splash.png');
        if (fs.existsSync(file)) await splash(file);
    }
    // Ícono de la ficha de Google Play (512x512, sin transparencia).
    await sharp(ICON).resize(512, 512).flatten({ background: INK }).png().toFile(path.join(ROOT, 'resources/play-store-icon.png'));
    console.log('Íconos y pantallas de inicio generados.');
})();
