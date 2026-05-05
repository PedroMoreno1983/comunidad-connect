const fs = require('fs');
const file = 'src/styles/reports.css';
let content = fs.readFileSync(file, 'utf8');

// Replace light mode backgrounds with dark mode equivalents
content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.5\)/g, 'rgba(15, 23, 42, 0.5)');
content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.6\)/g, 'rgba(15, 23, 42, 0.6)');
content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.8\)/g, 'rgba(15, 23, 42, 0.8)');
content = content.replace(/rgba\(255,\s*255,\s*255,\s*0\.95\)/g, 'rgba(15, 23, 42, 0.95)');

// specific replace for focus/hover that was white
content = content.replace(/background:\s*#ffffff;/g, 'background: var(--rp-card-hover);');
content = content.replace(/stroke=\"#ffffff\"/g, 'stroke=\"var(--rp-bg)\"');

fs.writeFileSync(file, content);
console.log('CSS updated');
