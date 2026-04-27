// Inject data.json into template.html and produce the final offline app.
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'template.html');
const dataPath = path.join(__dirname, 'data.json');
const outputPath = path.join(__dirname, '..', 'public', 'index.html');

const template = fs.readFileSync(templatePath, 'utf8');
const data = fs.readFileSync(dataPath, 'utf8');

if (!template.includes('__BIBLE_DATA__')) {
  console.error('template.html is missing the __BIBLE_DATA__ placeholder');
  process.exit(1);
}

// `data.json` is already valid JSON, which is also a valid JS expression.
// Inject as-is — no JSON.parse round-trip is needed at runtime.
const html = template.replace('__BIBLE_DATA__', () => data);

fs.writeFileSync(outputPath, html);
const size = fs.statSync(outputPath).size;
console.log('Wrote ' + outputPath + ' (' + (size / 1024 / 1024).toFixed(2) + ' MB)');
