const fs = require('fs');
let data = fs.readFileSync('src/lib/mockData.ts', 'utf8');

data = data.replace(/sellerId: '3'/g, "sellerId: '33333333-3333-3333-3333-333333333333'");
data = data.replace(/sellerId: '4'/g, "sellerId: '44444444-4444-4444-4444-444444444444'");
data = data.replace(/userId: '3'/g, "userId: '33333333-3333-3333-3333-333333333333'");
data = data.replace(/userId: '4'/g, "userId: '44444444-4444-4444-4444-444444444444'");
data = data.replace(/requesterId: '3'/g, "requesterId: '33333333-3333-3333-3333-333333333333'");
data = data.replace(/residentId: '3'/g, "residentId: '33333333-3333-3333-3333-333333333333'");

fs.writeFileSync('src/lib/mockData.ts', data);
console.log('Update complete.');
