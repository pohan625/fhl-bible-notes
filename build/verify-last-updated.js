const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data.json');
const sourcePath = path.join(__dirname, '..', 'source', 'sc_api_dump.json');
const publicPath = path.join(__dirname, '..', 'public');
const templatePath = path.join(__dirname, 'template.html');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const dataAssetName = fs.readdirSync(path.join(publicPath, 'assets')).find((name) => /^bible-data\.[a-f0-9]+\.js$/.test(name));
const appAssetName = fs.readdirSync(path.join(publicPath, 'assets')).find((name) => /^app\.[a-f0-9]+\.js$/.test(name));
if (!dataAssetName || !appAssetName) {
  throw new Error('Expected versioned Bible data and app JavaScript assets');
}
const dataAsset = fs.readFileSync(path.join(publicPath, 'assets', dataAssetName), 'utf8');
const appAsset = fs.readFileSync(path.join(publicPath, 'assets', appAssetName), 'utf8');
const template = fs.readFileSync(templatePath, 'utf8');
const templateDate = template.match(/const LAST_UPDATED_DATE = '([^']+)'/);
const expectedDate = process.env.EXPECTED_LAST_UPDATED_DATE || (templateDate && templateDate[1]);
if (!expectedDate) throw new Error('Could not determine expected last updated date');

if (data.sourceUpdatedAt !== source.fetchedAt) {
  throw new Error('Expected build/data.json to include sourceUpdatedAt from source dump');
}

if (!dataAsset.includes('"sourceUpdatedAt":"' + source.fetchedAt + '"')) {
  throw new Error('Expected versioned Bible data asset to include sourceUpdatedAt');
}

if (!appAsset.includes("const LAST_UPDATED_DATE = '" + expectedDate + "'")) {
  throw new Error('Expected versioned app asset to use the requested display date');
}

if (!appAsset.includes("class: 'home-updated-at'")) {
  throw new Error('Expected app asset to append the last updated label');
}

if (!appAsset.includes('home-updated-at')) {
  throw new Error('Expected app asset to include home-updated-at');
}

if (appAsset.includes('book-updated-at')) {
  throw new Error('Did not expect the last updated date on individual book pages');
}

console.log('Last updated date verification passed for ' + expectedDate);
