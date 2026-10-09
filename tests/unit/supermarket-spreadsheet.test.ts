import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { extractShoppingListFromWorkbook } from '@/lib/supermarketSpreadsheet';
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
});
