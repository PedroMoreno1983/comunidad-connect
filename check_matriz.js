const xlsx = require('xlsx');
const wb = xlsx.readFile('Matriz_Master.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);

console.log('=== COLUMNAS ===');
console.log(Object.keys(data[0]).join(' | '));

console.log('\n=== PRIMERAS 25 FILAS (con Subdimension y Subdimension_nombre) ===');
data.slice(0, 25).forEach((row, i) => {
  console.log(`${i+1}. Ind:${row.Indicador} | Dim:${row.Dimension} | Sub:${row.Subdimension} | Nombre:"${row.Subdimension_nombre}"`);
});

console.log('\n=== MAPEO CODIGO -> SDIM (como lo hace R) ===');
const mapeo = data
  .filter(row => row.Subdimension && row.Dimension && row.Indicador)
  .map(row => ({
    codigo_col: row.Subdimension.toUpperCase(),
    sdim: `${row.Indicador}_${row.Dimension}_${row.Subdimension}`,
    label_sdim: row.Subdimension_nombre ? row.Subdimension_nombre.trim() : ''
  }));

mapeo.slice(0, 25).forEach((m, i) => {
  console.log(`${i+1}. ${m.codigo_col} -> ${m.sdim} -> "${m.label_sdim}"`);
});
