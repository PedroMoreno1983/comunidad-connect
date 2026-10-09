import type ExcelJS from 'exceljs';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS, stripOptionalProductClarifications } from '@/lib/supermarketGroupDomain';

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

export function listLine(name: string, quantityText: string, sizeText = ''): string {
  const product = stripOptionalProductClarifications(name.trim())
    .replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const requestedSize = sizeText.trim();
  const namedProduct = requestedSize && !product.toLowerCase().includes(requestedSize.toLowerCase())
    ? `${product} ${requestedSize}` : product;
  const quantity = quantityText.trim().replace(',', '.');
  if (!quantity) return namedProduct;

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
  if (packageCount) return `1 paquetes ${namedProduct} ${packageCount[1]} un`;
  const dozen = quantity.match(/^(\d{1,2})\s+docenas?$/i);
  if (dozen) return `1 paquetes ${namedProduct} ${Number(dozen[1]) * 12} un`;
  const units = quantity.match(/^(\d{1,3})\s*(?:unidades?|un|uds?|filetes?|rollos?|bolsas?)$/i);
  if (units) return `${units[1]} ${namedProduct}`;
  if (/^\d{1,3}$/.test(quantity)) return `${quantity} ${namedProduct}`;
  return `${namedProduct} ${quantityText.trim()}`;
}

function shoppingRows(rows: string[][]): string[] | null {
  const productHeaders = new Set(['producto', 'productos', 'nombre', 'nombreproducto', 'item', 'articulo', 'descripcion', 'detalle']);
  const quantityHeaders = new Set(['cantidad', 'cant', 'unidades', 'qty', 'cuantos', 'numero']);
  const sizeHeaders = new Set(['presentacion', 'formato', 'tamano', 'medida', 'contenido', 'envase']);
  for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
    const headings = rows[index].map(normalized);
    const productColumn = headings.findIndex(heading => productHeaders.has(heading)
      || /^(?:descripcion|nombre)(?:del)?producto$/.test(heading));
    if (productColumn < 0) continue;
    const quantityColumn = headings.findIndex(heading => quantityHeaders.has(heading)
      || /^(?:cantidad|cant)(?:de)?(?:unidades|productos)$/.test(heading));
    const sizeColumn = headings.findIndex(heading => sizeHeaders.has(heading)
      || /^(?:tamano|contenido)(?:del)?envase$/.test(heading));
    return rows.slice(index + 1).map(cells => {
      const name = (cells[productColumn] || '').trim();
      if (!name || ['total', 'subtotal'].includes(normalized(name))) return '';
      return listLine(name, quantityColumn < 0 ? '' : cells[quantityColumn] || '', sizeColumn < 0 ? '' : cells[sizeColumn] || '');
    }).filter(Boolean);
  }
  return null;
}

function finalize(lines: string[]): string {
  if (lines.length > MAX_SHOPPING_LIST_ITEMS) return '';
  const list = lines.join('\n');
  return list.length <= MAX_SHOPPING_LIST_CHARS ? list : '';
}

export function extractShoppingListFromCsv(input: string): string {
  const sample = input.split(/\r?\n/, 5).join('\n');
  const delimiter = [';', '\t', ','].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  if (!delimiter || !sample.includes(delimiter)) return input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const table = shoppingRows(rows);
  if (table) return finalize(table);
  return finalize(rows.map(cells => {
    const first = cells[0] || '';
    const second = cells[1] || '';
    return /^\d{1,3}$/.test(first) && second ? listLine(second, first) : listLine(first, second);
  }).filter(Boolean));
}

export function extractShoppingListFromWorkbook(workbook: ExcelJS.Workbook): string {
  const lines: string[] = [];
  let foundTable = false;
  workbook.eachSheet(sheet => {
    const rows = Array.from({ length: sheet.rowCount }, (_, rowIndex) => {
      const row = sheet.getRow(rowIndex + 1);
      return Array.from({ length: Math.min(row.cellCount, 30) }, (_, columnIndex) => cellText(row.getCell(columnIndex + 1)));
    });
    const table = shoppingRows(rows);
    if (!table) return;
    foundTable = true;
    lines.push(...table);
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
  return finalize(lines);
}
