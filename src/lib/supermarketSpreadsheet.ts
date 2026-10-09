import type ExcelJS from 'exceljs';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS } from '@/lib/supermarketGroupDomain';

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value && (typeof value.result === 'string' || typeof value.result === 'number')) return String(value.result).trim();
  }
  return '';
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function listLine(name: string, quantityText: string): string {
  const product = name.trim().replace(/\s*\(([^)]+)\)/g, (whole, note: string) => {
    // Alternate names make every word mandatory in catalog matching. Keep dietary
    // and product attributes, which do affect the item the resident requested.
    return /\b(sin|con|descremad[ao]|enter[ao]|light|integral|gluten|az[uú]car|lactosa|sal|bajo|alta?)\b/i.test(note)
      ? whole
      : '';
  });
  const quantity = quantityText.trim().replace(',', '.');
  if (!quantity) return product;

  const sizedMultiple = quantity.match(/^(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|ml|cc)\s*[x×]\s*(\d{1,3})$/i)
    || quantity.match(/^(\d{1,3})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|ml|cc)$/i);
  if (sizedMultiple) {
    const reversed = /^\d{1,3}\s*[x×]/i.test(quantity);
    const count = Number(reversed ? sizedMultiple[1] : sizedMultiple[3]);
    const size = reversed ? sizedMultiple[2] : sizedMultiple[1];
    const unit = reversed ? sizedMultiple[3] : sizedMultiple[2];
    return `${count} paquetes ${product} ${size} ${unit}`;
  }

  const size = quantity.match(/^(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|ml|cc)$/i);
  if (size) return `1 paquetes ${product} ${size[1]} ${size[2]}`;
  const packageCount = quantity.match(/^(?:pack|paquete|caja)\s*(?:de\s*)?(\d{1,3})$/i);
  if (packageCount) return `1 paquetes ${product} ${packageCount[1]} un`;
  const dozen = quantity.match(/^(\d{1,2})\s+docenas?$/i);
  if (dozen) return `1 paquetes ${product} ${Number(dozen[1]) * 12} un`;
  const units = quantity.match(/^(\d{1,3})\s*(?:unidades?|un|uds?|filetes?|rollos?|bolsas?)$/i);
  if (units) return `${units[1]} ${product}`;
  if (/^\d{1,3}$/.test(quantity)) return `${quantity} ${product}`;
  return `${product} ${quantityText.trim()}`;
}

export function extractShoppingListFromWorkbook(workbook: ExcelJS.Workbook): string {
  const lines: string[] = [];
  let foundTable = false;
  workbook.eachSheet(sheet => {
    let headerRow = 0;
    let productColumn = 0;
    let quantityColumn = 0;
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let column = 1; column <= Math.min(row.cellCount, 30); column += 1) {
        const heading = normalized(cellText(row.getCell(column)));
        if (['producto', 'nombre', 'item', 'articulo'].includes(heading)) productColumn = column;
        if (['cantidad', 'cant', 'unidades', 'qty', 'presentacion', 'formato'].includes(heading)) quantityColumn = column;
      }
      if (productColumn) { headerRow = rowNumber; break; }
      quantityColumn = 0;
    }
    if (!headerRow) return;
    foundTable = true;
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount && lines.length < MAX_SHOPPING_LIST_ITEMS; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const name = cellText(row.getCell(productColumn));
      if (!name || ['total', 'subtotal'].includes(normalized(name))) continue;
      lines.push(listLine(name, quantityColumn ? cellText(row.getCell(quantityColumn)) : ''));
    }
  });
  if (!foundTable && workbook.worksheets[0]) {
    const sheet = workbook.worksheets[0];
    for (let rowNumber = 1; rowNumber <= sheet.rowCount && lines.length < MAX_SHOPPING_LIST_ITEMS; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const name = cellText(row.getCell(1));
      if (!name) continue;
      lines.push(listLine(name, cellText(row.getCell(2))));
    }
  }
  const list = lines.join('\n');
  return list.length <= MAX_SHOPPING_LIST_CHARS ? list : '';
}
