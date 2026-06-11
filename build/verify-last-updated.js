const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data.json');
const sourcePath = path.join(__dirname, '..', 'source', 'sc_api_dump.json');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const html = fs.readFileSync(htmlPath, 'utf8');
const expectedDate = '2026/6/11';

if (data.sourceUpdatedAt !== source.fetchedAt) {
  throw new Error('Expected build/data.json to include sourceUpdatedAt from source dump');
}

if (!html.includes('"sourceUpdatedAt":"' + source.fetchedAt + '"')) {
  throw new Error('Expected public/index.html to embed sourceUpdatedAt');
}

if (!html.includes("const LAST_UPDATED_DATE = '" + expectedDate + "'")) {
  throw new Error('Expected public/index.html to use the requested display date');
}

if (!html.includes("class: 'home-updated-at'")) {
  throw new Error('Expected home OT/NT lists to append the last updated label');
}

if (!html.includes('home-updated-at')) {
  throw new Error('Expected home page markup/style to include home-updated-at');
}

if (html.includes('book-updated-at')) {
  throw new Error('Did not expect the last updated date on individual book pages');
}

console.log('Last updated date verification passed for ' + expectedDate);
