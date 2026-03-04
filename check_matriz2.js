const xlsx = require('xlsx');
const wb = xlsx.readFile('Matriz_Master.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

// Crear mapeo único como lo hace R
const mapeoUnico = new Map();
data
  .filter(row => row.Subdimension && row.Dimension && row.Indicador)
  .forEach(row => {
    const codigo_col = row.Subdimension.toUpperCase();
    const sdim = `${row.Indicador}_${row.Dimension}_${row.Subdimension}`;
    const label_sdim = row.Subdimension_nombre ? row.Subdimension_nombre.trim() : '';
    
    if (!mapeoUnico.has(codigo_col)) {
      mapeoUnico.set(codigo_col, { sdim, label_sdim });
    }
  });

console.log('=== MAPEO ÚNICO (codigo_col -> sdim -> label_sdim) ===');
console.log('Total códigos únicos:', mapeoUnico.size);
console.log('');

mapeoUnico.forEach((val, key) => {
  console.log(`${key} -> ${val.sdim} -> "${val.label_sdim}"`);
});
