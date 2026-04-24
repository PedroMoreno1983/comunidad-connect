fetch('http://localhost:3000/test-card')
  .then(r => r.text())
  .then(t => {
    const match = t.match(/<div[^>]*class="[^"]*group relative overflow-hidden[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    if (match) console.log(match[0]);
    else console.log('not found');
  })
  .catch(e => console.log(e));
