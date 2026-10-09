import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { extractShoppingListFromCsv, extractShoppingListFromWorkbook } from '@/lib/supermarketSpreadsheet';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';

describe('supermarket spreadsheet import', () => {
  it('reads displaced headers and preserves pack size and quantity', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Lista');
    sheet.getCell('B2').value = 'Lista de supermercado';
    sheet.getCell('B4').value = 'N°';
    sheet.getCell('C4').value = 'Categoría';
    sheet.getCell('D4').value = 'Producto';
    sheet.getCell('E4').value = 'Cantidad';
    sheet.getCell('D5').value = 'Leche entera';
    sheet.getCell('E5').value = '1 L x 2';
    sheet.getCell('D6').value = 'Queso mantecoso';
    sheet.getCell('E6').value = '300 g';
    sheet.getCell('D7').value = 'Huevos';
    sheet.getCell('E7').value = '1 docena';
    sheet.getCell('D8').value = 'Palta (aguacate)';
    sheet.getCell('E8').value = 2;

    const list = extractShoppingListFromWorkbook(workbook);
    expect(list).toBe('2 paquetes Leche entera 1 L\n1 paquetes Queso mantecoso 300 g\n1 paquetes Huevos 12 un\n2 Palta');
    expect(parseGroupShoppingList(list, true)).toEqual([
      { term: 'leche entera 1 l', quantity: 2, unit: undefined },
      { term: 'queso mantecoso 300 g', quantity: 1, unit: undefined },
      { term: 'huevos 12 un', quantity: 1, unit: undefined },
      { term: 'palta', quantity: 2, unit: undefined },
    ]);
  });

  it('keeps simple two-column sheets compatible', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Compras');
    sheet.addRow(['Producto', 'Cantidad']);
    sheet.addRow(['Arroz', 2]);
    expect(extractShoppingListFromWorkbook(workbook)).toBe('2 Arroz');
  });

  it('reads product, format and quantity from a reordered sheet', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pedido');
    sheet.addRow(['Categoría', 'Cantidad', 'Descripción', 'Formato']);
    sheet.addRow(['Lácteos', 2, 'Leche descremada', '1 L']);
    sheet.addRow(['Abarrotes', 1, 'Arroz integral', '1 kg']);
    expect(extractShoppingListFromWorkbook(workbook)).toBe('2 Leche descremada 1 L\n1 Arroz integral 1 kg');
  });

  it('reads quoted comma CSV and distinct package quantities', () => {
    const csv = 'Categoría,Producto,Presentación,Cantidad\nLácteos,"Leche, sin lactosa",1 L,2\nVerduras,Palta (aguacate),700 g,1';
    const list = extractShoppingListFromCsv(csv);
    expect(list).toBe('2 Leche sin lactosa 1 L\n1 Palta 700 g');
  });

  it('supports semicolon sheets and simple quantity-first CSV', () => {
    expect(extractShoppingListFromCsv('Producto;Cantidad\nPan pita;3')).toBe('3 Pan pita');
    expect(extractShoppingListFromCsv('2,Leche entera 1 L\n1,Queso 300 g')).toBe('2 Leche entera 1 L\n1 Queso 300 g');
  });

  it('keeps parenthetical sizes and dietary attributes but ignores synonyms', () => {
    expect(parseGroupShoppingList('Leche entera (1 L)\nLeche (sin lactosa)\nReineta (pescado blanco)', true))
      .toEqual(expect.arrayContaining([
        { term: 'leche entera 1 l', quantity: 1, unit: undefined },
        { term: 'leche sin lactosa', quantity: 1, unit: undefined },
        { term: 'reineta', quantity: 1, unit: undefined },
      ]));
  });

  it('does not silently discard lines beyond the supported list limit', () => {
    const rows = ['Producto,Cantidad', ...Array.from({ length: 201 }, (_, i) => `Producto ${i},1`)];
    expect(extractShoppingListFromCsv(rows.join('\n'))).toBe('');
  });
});
