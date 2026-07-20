const fs = require('fs');
const path = require('path');

const publicPath = path.join(__dirname, '..', 'public');
const templatePath = path.join(__dirname, 'template.html');

const indexHtml = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8');
const dataAssetMatch = indexHtml.match(/<script defer src="\/assets\/(bible-data\.[a-f0-9]+\.js)"><\/script>/);
const appAssetMatch = indexHtml.match(/<script defer src="\/assets\/(app\.[a-f0-9]+\.js)"><\/script>/);
if (!dataAssetMatch || !appAssetMatch) throw new Error('Expected index.html to reference versioned Bible data and app JavaScript assets');
const dataAssetName = dataAssetMatch[1];
const appAssetName = appAssetMatch[1];
const dataAsset = fs.readFileSync(path.join(publicPath, 'assets', dataAssetName), 'utf8');
const appAsset = fs.readFileSync(path.join(publicPath, 'assets', appAssetName), 'utf8');
const template = fs.readFileSync(templatePath, 'utf8');
const templateDate = template.match(/const LAST_UPDATED_DATE = '([^']+)'/);
const expectedDate = process.env.EXPECTED_LAST_UPDATED_DATE || (templateDate && templateDate[1]);
if (!expectedDate) throw new Error('Could not determine expected last updated date');

const dataPrefix = 'window.__BIBLE_DATA__=';
if (!dataAsset.startsWith(dataPrefix)) throw new Error('Expected versioned Bible data asset to expose window.__BIBLE_DATA__');
const publicData = JSON.parse(dataAsset.slice(dataPrefix.length).trim().replace(/;$/, ''));
const sourceUpdatedAt = new Date(publicData.sourceUpdatedAt);
if (Number.isNaN(sourceUpdatedAt.getTime())) throw new Error('Expected versioned Bible data asset to include a valid sourceUpdatedAt');
const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
}).formatToParts(sourceUpdatedAt).map(({ type, value }) => [type, value]));
const publicDataDate = `${dateParts.year}/${dateParts.month}/${dateParts.day}`;
if (publicDataDate !== expectedDate) throw new Error(`Expected public Bible data date ${publicDataDate} to match displayed date ${expectedDate}`);

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
