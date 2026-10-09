import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { extractShoppingListFromWorkbook } from '@/lib/supermarketSpreadsheet';

export const runtime = 'nodejs';

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
    const list = extractShoppingListFromWorkbook(workbook);
    if (!list) {
      return NextResponse.json({ error: 'El archivo no contiene una lista legible dentro del límite.' }, { status: 400 });
    }
    return NextResponse.json({ list }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo XLSX.' }, { status: 400 });
  }
}
