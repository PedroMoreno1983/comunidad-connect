import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS } from '@/lib/supermarketGroupDomain';

export const runtime = 'nodejs';

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value && (typeof value.result === 'string' || typeof value.result === 'number')) return String(value.result).trim();
  }
  return '';
}

export async function POST(req: NextRequest) {
  const client = await getSupabaseUserClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > 1_000_000) {
    return NextResponse.json({ error: 'Sube un archivo XLSX de hasta 1 MB.' }, { status: 400 });
  }
  try {
    const workbook = new ExcelJS.Workbook();
    const bytes = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const lines: string[] = [];
    workbook.eachSheet(sheet => {
      const quantityColumn = /^(cantidad|cant\.?|unidades|qty)$/i.test(cellText(sheet.getRow(1).getCell(2)));
      sheet.eachRow({ includeEmpty: false }, row => {
      if (lines.length >= MAX_SHOPPING_LIST_ITEMS) return;
      const first = cellText(row.getCell(1));
      const second = cellText(row.getCell(2));
      if (!first || /^(producto|nombre|item|art[ií]culo)$/i.test(first)) return;
      const quantity = quantityColumn && /^\d{1,3}$/.test(second) ? Number(second) : 1;
      lines.push(`${quantity} ${first}`);
      });
    });
    const list = lines.join('\n');
    if (!list || list.length > MAX_SHOPPING_LIST_CHARS) {
      return NextResponse.json({ error: 'El archivo no contiene una lista legible dentro del límite.' }, { status: 400 });
    }
    return NextResponse.json({ list }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo XLSX.' }, { status: 400 });
  }
}
