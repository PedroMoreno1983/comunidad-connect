// Genera avatares ilustrados para proveedores sin foto, los sube a Supabase
// Storage (bucket público "avatars") y actualiza service_providers.photo.
// Uso: node scripts/provider_avatars.mjs <start> <count>
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync, mkdirSync, existsSync } from 'fs';

const COMMUNITY_ID = 'b392cf17-fd6b-47dd-b0b4-72b0e007824e';
const PLUGIN_DIR = 'C:/Users/pedro.moreno/AppData/Roaming/kimi-desktop/daimon-share/daimon/runtime/kimi-code/home/plugins/managed/image_generation';
const OUT_DIR = 'C:/Users/pedro.moreno/Desktop/comunidad-connect/tmp/avatars';
mkdirSync(OUT_DIR, { recursive: true });

const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AGES = ['in his early 30s', 'in his 40s', 'in his 50s', 'in his late 30s'];
const FACIAL = ['clean-shaven', 'with a short beard', 'with a mustache', 'with light stubble'];
const ELEC_HAT = ['yellow hard hat', 'white hard hat', 'orange hard hat'];
const GAS_HAT = ['navy baseball cap', 'gray work cap', 'no hat, short dark hair'];
const SHIRTS = ['navy blue work shirt', 'gray work polo', 'burgundy work shirt', 'teal work shirt', 'charcoal work jacket'];
const BGS = ['#FAF7F1 warm cream', '#EFF6FB light blue', '#F5F0E8 warm sand', '#F2F4F0 light sage'];

function buildPrompt(provider, idx) {
    const isElectrical = provider.category === 'electrical';
    const hat = isElectrical ? ELEC_HAT[idx % ELEC_HAT.length] : GAS_HAT[idx % GAS_HAT.length];
    const emblem = isElectrical ? 'a small lightning bolt emblem' : 'a small wrench emblem';
    const trade = isElectrical ? 'electrician' : 'gasfitter plumber';
    const age = AGES[idx % AGES.length];
    const facial = FACIAL[idx % FACIAL.length];
    const shirt = SHIRTS[idx % SHIRTS.length];
    const bg = BGS[idx % BGS.length];
    return `Flat vector illustration avatar portrait, bust centered, of a friendly Chilean male ${trade} ${age}, ${facial}, wearing a ${hat} and ${shirt} with ${emblem}, confident warm smile, modern corporate flat illustration style with clean geometric shapes and soft shading, solid ${bg} background, high quality, professional profile picture, no text, no watermark`;
}

const start = parseInt(process.argv[2] || '0', 10);
const count = parseInt(process.argv[3] || '4', 10);

const { data: providers, error } = await sb
    .from('service_providers')
    .select('id, name, category')
    .eq('community_id', COMMUNITY_ID)
    .is('photo', null)
    .neq('id', 'b392cf17-0006-4000-8000-000000000010') // Mesa de ayuda interna: no es persona
    .order('name', { ascending: true });

if (error) { console.error('ERROR consultando:', error.message); process.exit(1); }

const batch = providers.slice(start, start + count);
console.log(`Sin foto: ${providers.length} | Procesando ${batch.length} (desde ${start})`);

let ok = 0;
for (const [i, provider] of batch.entries()) {
    const idx = start + i;
    const pngPath = `${OUT_DIR}/${provider.id}.png`;
    const jpgPath = `${OUT_DIR}/${provider.id}.jpg`;
    try {
        const prompt = buildPrompt(provider, idx);
        execSync(
            `python scripts/image_generation_tool.py generate --description "${prompt}" --ratio "1:1" --resolution "1K" --background "opaque" --output "${pngPath}"`,
            { cwd: PLUGIN_DIR, stdio: 'pipe', timeout: 240000 }
        );
        if (!existsSync(pngPath)) throw new Error('no se generó el archivo');

        // Recortar marca de agua inferior y normalizar a 512x512 JPEG
        execSync(
            `python -c "from PIL import Image, ImageOps; im = Image.open(r'${pngPath}'); w, h = im.size; im = im.crop((0, 0, w, h - 72)); im = ImageOps.fit(im, (512, 512)); im.convert('RGB').save(r'${jpgPath}', 'JPEG', quality=85)"`,
            { stdio: 'pipe', timeout: 60000 }
        );

        const storagePath = `providers/${provider.id}.jpg`;
        const { error: upErr } = await sb.storage
            .from('avatars')
            .upload(storagePath, readFileSync(jpgPath), { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw new Error('upload: ' + upErr.message);

        const { data: pub } = sb.storage.from('avatars').getPublicUrl(storagePath);
        const { error: updErr } = await sb
            .from('service_providers')
            .update({ photo: pub.publicUrl })
            .eq('id', provider.id);
        if (updErr) throw new Error('update: ' + updErr.message);

        ok++;
        console.log(`OK ${provider.name} -> ${pub.publicUrl}`);
    } catch (err) {
        console.error(`FALLO ${provider.name}: ${err.message.slice(0, 200)}`);
    }
}
console.log(`Listos: ${ok}/${batch.length}`);
