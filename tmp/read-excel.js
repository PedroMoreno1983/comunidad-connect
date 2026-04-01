const xlsx = require('xlsx');

try {
  const filePath = "C:\\Users\\pedro.moreno\\Downloads\\Administradores_RM.xlsx";
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet);
  
  if (data.length > 0) {
      console.log('Columns in Excel:');
      console.log(Object.keys(data[0]).join(', '));
      console.log('\nFirst row values:');
      console.log(JSON.stringify(data[0], null, 2));
  }
} catch (error) {
  console.error('Error reading excel:', error);
}
