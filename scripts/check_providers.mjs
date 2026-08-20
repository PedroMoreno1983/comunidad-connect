import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Cargar .env.local manualmente (sin imprimir secretos)
const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter(line => line.includes('=') && !line.startsWith('#'))
        .map(line => {
            const idx = line.indexOf('=');
            return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
    .from('service_providers')
    .select('id, name, category, email, community_id, verified')
    .order('created_at', { ascending: true });

if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
}

console.log('Total proveedores:', data.length);
for (const p of data) {
    console.log(`${p.id} | ${p.name} | ${p.category} | ${p.email || '-'} | community=${p.community_id} | verified=${p.verified}`);
}
