const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const downloadsDir = path.join(process.env.USERPROFILE, 'Downloads');
const files = [
    'Administradores_RM.xlsx',
    'administradores_onerosos_santiago (1).xlsx',
    'administradores_onerosos_santiago_ESTRUCTURADO.xlsx'
];

files.forEach(file => {
    const filePath = path.join(downloadsDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`\n--- Checking ${file} ---`);
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (data.length > 0) {
                console.log('Headers:', data[0]);
                console.log('Row count:', data.length - 1);
            } else {
                console.log('File is empty.');
            }
        } catch (e) {
            console.error(`Error reading ${file}:`, e.message);
        }
    } else {
        console.log(`${file} not found.`);
    }
});
