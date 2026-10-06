const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const matches = [...html.matchAll(/id=['"]modal-goal-author['"]/g)];
console.log('Matches in index.html:', matches.length);
