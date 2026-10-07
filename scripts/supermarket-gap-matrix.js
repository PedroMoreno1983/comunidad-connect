// Matriz de gaps: para cada término común, ¿qué tiendas tienen filas usables
// (frescas <96h, en stock) que calzan? Uso: node scripts/supermarket-gap-matrix.js
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { loadEnvFile } = require('./load-env');

loadEnvFile(path.join(process.cwd(), '.env.local'));

const STORES = ['Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta'];
const TTL_HOURS = 96;

// Términos usados en la batería de listas de prueba (normalizados)
const TERMS = [
  'arroz', 'fideos', 'aceite', 'sal', 'azucar', 'harina', 'café', 'té', 'leche', 'huevos',
  'pan de molde', 'mantequilla', 'queso', 'jamón', 'pollo', 'carne molida', 'atún', 'sardinas',
  'tomates', 'cebolla', 'papas', 'palta', 'manzanas', 'plátanos', 'limones', 'lechuga', 'ajo',
  'avena', 'mermelada', 'yogurt', 'detergente', 'cloro', 'papel higiénico', 'shampoo',
  'pasta de dientes', 'jabón', 'agua mineral', 'coca cola', 'jugo de naranja', 'cerveza',
  'vino tinto', 'galletas', 'chocolate', 'mayonesa', 'ketchup', 'mostaza', 'choclo', 'porotos',
  'quinoa', 'leche de almendras', 'queso rallado', 'salsa de tomate', 'chorizo', 'carbón',
  'esponja', 'limpiapisos', 'lavavajillas', 'desodorante', 'toalla de papel', 'pañales',
  'comida de perro', 'comida de gato', 'toallitas húmedas', 'salsa de soya', 'curry', 'palmitos',
  'pan', 'dulces', 'lentejas',
];

function fold(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const cutoff = new Date(Date.now() - TTL_HOURS * 3600 * 1000).toISOString();

  const matrix = [];
  for (const term of TERMS) {
    const primary = fold(term).split(' ').sort((a, b) => b.length - a.length)[0];
    const pattern = primary.length <= 2 ? `${primary}%` : `%${primary}%`;
    const { data, error } = await admin
      .from('supermarket_products')
      .select('store')
      .eq('in_stock', true)
      .gte('last_seen_at', cutoff)
      .ilike('name', pattern)
      .limit(500);
    if (error) { console.error(term, error.message); continue; }
    const present = new Set((data || []).map(r => r.store));
    const missing = STORES.filter(s => !present.has(s));
    matrix.push({ term, missing });
  }

  const gapRows = matrix.filter(r => r.missing.length > 0);
  console.log(`Términos probados: ${matrix.length} | con gaps: ${gapRows.length} | sin gaps: ${matrix.length - gapRows.length}\n`);
  console.log('Término                | tiendas SIN cobertura usable');
  for (const r of gapRows) {
    console.log(`${r.term.padEnd(22)} | ${r.missing.join(', ')}`);
  }

  console.log('\nResumen por tienda (términos sin cobertura):');
  for (const s of STORES) {
    const n = gapRows.filter(r => r.missing.includes(s)).length;
    console.log(`  ${s}: ${n} términos sin cobertura`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
